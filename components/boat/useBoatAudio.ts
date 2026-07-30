'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MathUtils, Quaternion, Vector3 } from 'three';

type ImpactKind = 'obstacle' | 'terrain';

interface AudioRuntime {
  context: AudioContext | null;
  panner: PannerNode | null;
  engineOscillator: OscillatorNode | null;
  engineFilter: BiquadFilterNode | null;
  waveGain: GainNode | null;
}

const INITIAL_RUNTIME: AudioRuntime = {
  context: null,
  panner: null,
  engineOscillator: null,
  engineFilter: null,
  waveGain: null,
};

/**
 * Owns the Web Audio graph for a vessel.
 *
 * The physics component only publishes the latest vessel/camera state. This
 * keeps AudioContext lifecycle and positional-audio scratch objects out of the
 * hot physics loop.
 */
export function useBoatAudio() {
  const runtimeRef = useRef<AudioRuntime>({ ...INITIAL_RUNTIME });
  const lastImpactAtRef = useRef(-Infinity);
  const scratch = useMemo(
    () => ({
      motorPosition: new Vector3(),
      cameraForward: new Vector3(),
      cameraUp: new Vector3(),
    }),
    [],
  );

  useEffect(() => {
    const initAudio = () => {
      const existingContext = runtimeRef.current.context;
      if (existingContext) {
        if (existingContext.state === 'suspended') {
          void existingContext.resume();
        }
        return;
      }

      const AudioContextClass =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextClass) return;

      const context = new AudioContextClass();
      const panner = context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2;
      panner.maxDistance = 1000;
      panner.rolloffFactor = 1;

      const masterGain = context.createGain();
      masterGain.gain.value = 0.6;
      panner.connect(masterGain);
      masterGain.connect(context.destination);

      const engineOscillator = context.createOscillator();
      engineOscillator.type = 'sawtooth';
      engineOscillator.frequency.value = 40;

      const enginePulse = context.createOscillator();
      enginePulse.type = 'sine';
      enginePulse.frequency.value = 15;
      const pulseGain = context.createGain();
      pulseGain.gain.value = 12;
      enginePulse.connect(pulseGain);
      pulseGain.connect(engineOscillator.frequency);

      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 150;

      const engineGain = context.createGain();
      engineGain.gain.value = 0.4;
      engineOscillator.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(panner);

      const noiseBuffer = context.createBuffer(
        1,
        context.sampleRate * 2,
        context.sampleRate,
      );
      const noiseData = noiseBuffer.getChannelData(0);
      for (let index = 0; index < noiseData.length; index += 1) {
        noiseData[index] = Math.random() * 2 - 1;
      }

      const waveSource = context.createBufferSource();
      waveSource.buffer = noiseBuffer;
      waveSource.loop = true;

      const waveFilter = context.createBiquadFilter();
      waveFilter.type = 'bandpass';
      waveFilter.frequency.value = 450;
      waveFilter.Q.value = 0.6;

      const waveGain = context.createGain();
      waveGain.gain.value = 0;
      waveSource.connect(waveFilter);
      waveFilter.connect(waveGain);
      waveGain.connect(panner);

      enginePulse.start();
      engineOscillator.start();
      waveSource.start();

      runtimeRef.current = {
        context,
        panner,
        engineOscillator,
        engineFilter,
        waveGain,
      };
    };

    window.addEventListener('pointerdown', initAudio);
    window.addEventListener('keydown', initAudio);

    return () => {
      window.removeEventListener('pointerdown', initAudio);
      window.removeEventListener('keydown', initAudio);

      const context = runtimeRef.current.context;
      runtimeRef.current = { ...INITIAL_RUNTIME };
      if (context) void context.close();
    };
  }, []);

  return useMemo(
    () => ({
      playSlam(severity: number) {
        const { context, waveGain } = runtimeRef.current;
        if (!context || !waveGain || context.state !== 'running') return;

        const now = context.currentTime;
        waveGain.gain.cancelScheduledValues(now);
        waveGain.gain.setTargetAtTime(
          Math.min(3, 1 + severity * 0.4),
          now,
          0.02,
        );
        waveGain.gain.setTargetAtTime(0, now + 0.6, 0.5);
      },

      playImpact(severity: number, kind: ImpactKind) {
        const { context, panner } = runtimeRef.current;
        if (!context || !panner || context.state !== 'running') return;

        const now = context.currentTime;
        if (now - lastImpactAtRef.current < 0.075) return;
        lastImpactAtRef.current = now;

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const isTerrain = kind === 'terrain';
        const duration = isTerrain ? 0.5 : 0.3;

        oscillator.type = isTerrain ? 'square' : 'sawtooth';
        oscillator.frequency.setValueAtTime(isTerrain ? 40 : 80, now);
        oscillator.frequency.exponentialRampToValueAtTime(10, now + duration);

        gain.gain.setValueAtTime(
          Math.min(severity * (isTerrain ? 0.6 : 0.5), 2),
          now,
        );
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        oscillator.connect(gain);
        gain.connect(panner);
        oscillator.start(now);
        oscillator.stop(now + duration);
      },

      updateFrame(
        boatPosition: Vector3,
        forwardDirection: Vector3,
        cameraPosition: Vector3,
        cameraQuaternion: Quaternion,
        engineRpm: number,
        isSpeedboat: boolean,
        horizontalSpeed: number,
        submergedRatio: number,
      ) {
        const {
          context,
          panner,
          engineOscillator,
          engineFilter,
          waveGain,
        } = runtimeRef.current;

        if (!context || !panner || context.state !== 'running') return;

        const now = context.currentTime;
        scratch.motorPosition
          .copy(boatPosition)
          .addScaledVector(forwardDirection, -2);

        panner.positionX.setTargetAtTime(scratch.motorPosition.x, now, 0.1);
        panner.positionY.setTargetAtTime(scratch.motorPosition.y, now, 0.1);
        panner.positionZ.setTargetAtTime(scratch.motorPosition.z, now, 0.1);

        const listener = context.listener;
        listener.positionX.setTargetAtTime(cameraPosition.x, now, 0.1);
        listener.positionY.setTargetAtTime(cameraPosition.y, now, 0.1);
        listener.positionZ.setTargetAtTime(cameraPosition.z, now, 0.1);

        scratch.cameraForward
          .set(0, 0, -1)
          .applyQuaternion(cameraQuaternion);
        scratch.cameraUp.set(0, 1, 0).applyQuaternion(cameraQuaternion);

        listener.forwardX.setTargetAtTime(scratch.cameraForward.x, now, 0.1);
        listener.forwardY.setTargetAtTime(scratch.cameraForward.y, now, 0.1);
        listener.forwardZ.setTargetAtTime(scratch.cameraForward.z, now, 0.1);
        listener.upX.setTargetAtTime(scratch.cameraUp.x, now, 0.1);
        listener.upY.setTargetAtTime(scratch.cameraUp.y, now, 0.1);
        listener.upZ.setTargetAtTime(scratch.cameraUp.z, now, 0.1);

        if (engineOscillator && engineFilter) {
          const targetFrequency = Math.max(
            35,
            engineRpm * (isSpeedboat ? 0.05 : 0.04),
          );
          engineOscillator.frequency.setTargetAtTime(
            targetFrequency,
            now,
            0.1,
          );
          engineFilter.frequency.setTargetAtTime(
            targetFrequency * 3.5,
            now,
            0.2,
          );
        }

        if (waveGain) {
          const volume =
            MathUtils.clamp(horizontalSpeed / 30, 0, 0.6) * submergedRatio;
          waveGain.gain.setTargetAtTime(volume, now, 0.8);
        }
      },
    }),
    [scratch],
  );
}
