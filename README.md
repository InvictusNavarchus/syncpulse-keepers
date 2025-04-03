# SyncPulse Keepers

A simple, cooperative P2P rhythm/reaction multiplayer game built with SvelteKit. Keep the pulse alive by clicking nodes in sync with your friends! Runs entirely client-side using PeerJS for direct connections, requiring no dedicated server backend.

## Features

* **Real-time Cooperative Gameplay:** Work together with friends to achieve a high score.
* **Peer-to-Peer (P2P) Multiplayer:** Uses PeerJS (leveraging WebRTC) for direct connections between players.
* **Serverless Architecture:** No backend server hosting required for gameplay logic or connections (relies on the public PeerJS signaling server for initial handshake).
* **Modern Frontend Stack:** Built with SvelteKit (~v2.16) / Svelte 5 and Vite (~v6.0).
* **Simple Connection System:** Uses easy-to-share Peer IDs for hosting and joining games.
* **Dynamic Difficulty:** The game speeds up and gets more challenging the longer you survive.
* **Static Site Deployment:** Configured for seamless deployment to platforms like Netlify.

## Tech Stack

* **Framework:** SvelteKit (~v2.16) / Svelte 5
* **Build Tool:** Vite (~v6.0)
* **P2P Communication:** PeerJS (loaded via CDN)
* **Language:** JavaScript (ES Modules) / HTML / CSS
* **Deployment Platform:** Configured for Netlify

## Getting Started

Follow these instructions to get a local copy up and running for development and testing.

### Prerequisites

* Node.js (LTS version recommended, e.g., v18 or v20+)
* npm (comes with Node.js), or alternatively pnpm or yarn

### Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-username/syncpulse-keepers.git](https://www.google.com/search?q=https://github.com/your-username/syncpulse-keepers.git)
    ```
    *(Replace `your-username/syncpulse-keepers.git` with your actual repository URL)*

2.  **Navigate to the project directory:**
    ```bash
    cd syncpulse-keepers
    ```

3.  **Install dependencies:**
    ```bash
    npm install
    ```
    *(Or `pnpm install` / `yarn install` if you use those package managers)*

## Running Locally

To start the development server:

```bash
npm run dev