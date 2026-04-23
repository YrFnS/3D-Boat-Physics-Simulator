# 3D Boat Physics Simulator

A high-fidelity 3D simulation of boat hydrodynamics and environmental interaction, built with **React Three Fiber** and **Next.js**.

## 🚤 Overview

This simulator provides a realistic experience of handling various watercraft in dynamic environments. It features a custom physics engine that accounts for buoyancy, wind force, current drag, and hydrodynamic resistance.

## ✨ Key Features

- **Realistic Physics Engine**: 
  - Hydrodynamic buoyancy and drag calculations.
  - Wind interaction affecting boat handling and sail dynamics.
  - Water current simulation that influences movement.
- **Dynamic Environments**:
  - **Ocean System**: Procedural waves with realistic lighting.
  - **River System**: Directional currents and navigational challenges.
  - **Islands & Buoys**: Interactive obstacles and navigation markers.
- **Extreme Weather Simulation**:
  - Dynamic cloud systems and hurricane simulations.
  - Realistic tornadoes with integrated particle effects.
  - Volumetric weather effects including rain and lightning.
- **Advanced HUD & Telemetry**:
  - Real-time engine status and speed tracking.
  - Compass and navigation indicators.
  - Environment controls (time of day, weather toggle).
- **Multiple Boat Support**:
  - Modular boat architecture allowing for different vessel types.

## 🛠️ Tech Stack

- **Framework**: [Next.js 15+](https://nextjs.org/)
- **3D Engine**: [React Three Fiber](https://r3f.docs.pmnd.rs/) & [Three.js](https://threejs.org/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Physics/Math**: Simplex Noise for procedural waves and wind.
- **Animations**: [Motion](https://motion.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App

Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the simulator.

## 🏗️ Project Structure

- `app/`: Next.js App Router and entry points.
- `components/`: Core simulation logic and 3D components.
  - `Boat.tsx`: Main boat physics and controller.
  - `Ocean.tsx`: Water shader and interaction.
  - `EnvironmentRig.tsx`: Lighting and skybox management.
- `store/`: Zustand state for global simulation parameters (wind, time, weather).
- `hooks/`: Custom hooks for physics calculations and input handling.

## 📜 License

MIT
