<div align="center">
  <img src="https://raw.githubusercontent.com/Devi-chandrika24/Decision_Route/main/src/assets/icon.png" alt="Decision Route Logo" width="120" />

  <h1>Decision Route</h1>
  <strong>A smart, multi-modal route decision engine.</strong><br><br>

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![JavaScript](https://img.shields.io/badge/Language-JavaScript%20(ES6%2B)-yellow)](#)
  [![UI](https://img.shields.io/badge/UI-Vanilla%20CSS-ff69b4)](#)
</div>

<br />

## 🛣️ Overview
**Decision Route** is an intelligent, open-source web application that goes beyond simple directions. It allows users to compare up to three route alternatives side-by-side using a smart scoring algorithm. By taking into account user-defined preferences (duration vs. distance) and real-time weather risks, it highlights the **optimal route** to take.

Built completely with **Vanilla JavaScript (ES6+), HTML5, and CSS3** (No heavy frontend frameworks), it is blazing fast and lightweight.

---

## ✨ Features
* 🚦 **Multi-Route Comparison:** Compares up to 3 routes side-by-side.
* ⚖️ **Dynamic Scoring Engine:** Balances time, distance, and user preferences to dynamically calculate the best recommendation.
* ☁️ **Weather Risk Integration:** Retrieves weather data along each route (via Open-Meteo) and flags risks like heavy rain or low visibility.
* 🗺️ **Interactive Maps:** Beautiful, interactive maps rendered with Leaflet.js and OpenStreetMap.
* 🎨 **Glassmorphism UI:** Stunning, modern UI with smooth 3D tilt interactions and a responsive grid layout.
* 💵 **Cost Estimation:** Provides heuristic-based fuel and toll cost estimations.
* ⚡ **Zero-Build Architecture:** No Webpack, no Babel. Just pure standard web technologies.

---

## 🛠️ Tech Stack
* **Frontend:** Vanilla JavaScript (ES Modules), HTML5, CSS3 (Custom Properties, Flexbox, Grid)
* **Icons:** [Phosphor Icons](https://phosphoricons.com/)
* **Maps:** [Leaflet.js](https://leafletjs.com/)
* **Routing API:** [OSRM (Open Source Routing Machine)](http://project-osrm.org/)
* **Geocoding API:** [Nominatim (OpenStreetMap)](https://nominatim.org/)
* **Weather API:** [Open-Meteo](https://open-meteo.com/)

---

## 🚀 Getting Started

Since this project uses ES modules, you need a local web server to run it. You cannot simply double-click the \index.html\ file due to browser CORS policies.

### Prerequisites
* [Node.js](https://nodejs.org/) (or any local web server like Python's \http.server\)

### Installation & Run

1. **Clone the repository**
   \\\ash
   git clone https://github.com/Devi-chandrika24/Decision_Route.git
   cd Decision_Route
   \\\

2. **Serve the app**
   If you have Node.js installed, you can use \
px serve\:
   \\\ash
   npx serve src
   \\\
   Or if you prefer Python:
   \\\ash
   cd src
   python -m http.server 8000
   \\\

3. **Open your browser**
   Navigate to \http://localhost:3000\ (or \http://localhost:8000\ for Python).

---

## 🏗️ Architecture

The app is built using a unidirectional data flow pattern, inspired by modern frameworks, but implemented in Vanilla JS.

\\\
src/
├── css/             # Modular CSS stylesheets (variables, components, layout)
├── js/
│   ├── api/         # API integrations (OSRM, Nominatim, Open-Meteo)
│   ├── components/  # UI components (search, sliders, map, comparison cards)
│   ├── services/    # Business logic (scoring, normalization, debounce)
│   ├── store.js     # Centralised reactive state management
│   └── app.js       # Main application entry point
└── index.html       # The single page HTML structure
\\\

---

## 🧠 Scoring Algorithm

The \scoreRoutes\ function normalizes duration and distance across all available routes. It then applies the user's selected preference weight (via the UI sliders) and calculates a penalty for any weather risks (e.g., heavy rain or poor visibility). The route with the highest resulting score is flagged as **Recommended**.

---

## 📜 License
Distributed under the MIT License. See \LICENSE\ for more information.

---

<div align="center">
  <i>Built with ❤️ by Devi Chandrika</i>
</div>
