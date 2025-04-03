<script>
    import { onMount, onDestroy } from 'svelte';
    import {
        peer,
        peerId,
        gameIdToJoin,
        isHost,
        connections, // Use this if host needs to know about specific connections
        hostConnection,
        connectionStatus,
        connectedPeers, // Display connected peers
        connectionError,
        initializePeer,
        connectToHost,
        destroyPeer,
        broadcastData,
        sendDataToHost
    } from '$lib/connectionStore.js'; // Adjust path if needed

    // Game State (using Svelte's reactive declarations)
    let gameRunning = false;
    let pulseHealth = 100;
    let score = 0; // Time survived in seconds
    let nodes = []; // Array of { id: number, x: number, y: number, timer: number, maxTimer: number }
    let gameOver = false;

    // Game Config
    const MAX_HEALTH = 100;
    const HEALTH_DRAIN_RATE = 1; // Points per second
    const NODE_SPAWN_INTERVAL_START = 3000; // ms
    const NODE_SPAWN_INTERVAL_MIN = 800; // ms
    const NODE_TIMER_DURATION = 5000; // ms
    const HEALTH_GAIN_PER_CLICK = 5;
    const HEALTH_LOSS_PER_MISS = 15;

    let gameLoopInterval = null;
    let nodeSpawnInterval = null;
    let scoreInterval = null;
    let nextNodeId = 0;

    // --- Lifecycle ---
    onMount(() => {
        // Initialize PeerJS when the component mounts
        // Initialize only once. Subsequent navigation might not need re-init if store persists.
        if (!$peer) {
            initializePeer();
        }

        // Define the global handler for incoming game data (from the store)
        window.handleGameData = (data, senderPeerId) => {
            // Client receives state updates from host
            if (!$isHost && data.type === 'gameStateUpdate') {
                // ONLY update state if received from the actual host
                if ($hostConnection && senderPeerId === $hostConnection.peer) {
                    pulseHealth = data.state.health;
                    score = data.state.score;
                    nodes = data.state.nodes;
                    gameRunning = data.state.running;
                    gameOver = data.state.gameOver;
                } else {
                     console.warn(`Received gameStateUpdate from unexpected peer ${senderPeerId}. Ignoring.`);
                }
            }
            // Host receives actions from clients
            else if ($isHost && data.type === 'playerAction') {
                 if (data.action === 'clickNode') {
                    handleNodeClick(data.nodeId, senderPeerId); // Process the click on the host
                 }
            }
             // Client receives Game Over signal from host
             else if (!$isHost && data.type === 'gameOver') {
                 gameOver = true;
                 gameRunning = false;
                 stopGameTimers(); // Stop client-side timers if any
                 // Maybe show final score received from host?
                 if (data.finalScore) score = data.finalScore;
             }
             else if (data.type === 'welcome') {
                 console.log("Received welcome:", data.message);
                 // If host sends initial state on welcome, handle it here
             }
             else if (data.type === 'peerDisconnect') {
                 // Host informed other clients that a peer left
                 console.log(`Peer ${data.peerId} disconnected.`);
                 // Optional: Show this info in the UI
             }
        };

         // Define a handler for when the store detects a disconnect
        window.handleGameDisconnect = (disconnectedPeerId) => {
             if (!$isHost && $hostConnection === null) {
                // Client lost connection to host
                gameOver = true;
                gameRunning = false;
                connectionError.set("Lost connection to the host.");
                stopGameTimers();
             } else if ($isHost) {
                 // A client disconnected from the host
                 console.log(`Player ${disconnectedPeerId} left the game.`);
                 // Optional: Broadcast this info to remaining players
                 broadcastData({ type: 'peerDisconnect', peerId: disconnectedPeerId });
             }
        };

    });

    onDestroy(() => {
        // Clean up PeerJS connection when component is destroyed
        // Avoid destroying if navigating within the app where store persists
        // destroyPeer(); // Consider if this should happen on page leave or app close
        stopGame(); // Ensure game loops are stopped
        // Remove global handlers
        delete window.handleGameData;
        delete window.handleGameDisconnect;
    });

    // --- Host Actions ---
    function startGameHost() {
        if (!$isHost || gameRunning || !$connections || Object.keys($connections).length === 0) {
            console.log("Cannot start game: Not host, already running, or no players connected.");
            // Allow starting solo if desired: Add check `!$isHost || gameRunning`
            // if (!$isHost) return; // Strict check
            if (!Object.keys($connections).length === 0 && !$isHost) {
                 connectionError.set("Wait for players to join!");
                 return;
            }
             // Allow solo hosting?
             // console.log("Starting solo game as host.");

        }
        console.log("Host starting game...");
        gameOver = false;
        pulseHealth = MAX_HEALTH;
        score = 0;
        nodes = [];
        nextNodeId = 0;
        gameRunning = true;

        // Start game loops (only on host)
        startGameTimers();

        // Broadcast initial game state to all clients
        broadcastGameState();
    }

    // --- Client Actions ---
    function joinGame() {
        if ($gameIdToJoin) {
            connectToHost($gameIdToJoin);
        } else {
            connectionError.set("Please enter a Game ID to join.");
        }
    }

    // --- Game Logic (Primarily executed by Host) ---

    function startGameTimers() {
        stopGameTimers(); // Ensure no duplicates

        // Score increases over time
        scoreInterval = setInterval(() => {
             if (!gameRunning || gameOver) return;
             score++;
             // Host broadcasts periodically (or on significant change)
             // broadcastGameState(); // Might be too frequent, send less often?
        }, 1000);

        // Main game loop for health drain and checking game over
        gameLoopInterval = setInterval(() => {
             if (!gameRunning || gameOver) return;

             // Drain health
             pulseHealth -= HEALTH_DRAIN_RATE / (1000 / 100); // Drain per 100ms interval
             pulseHealth = Math.max(0, pulseHealth); // Clamp at 0

              // Update node timers & check for misses
             let missed = false;
             nodes = nodes.map(node => {
                node.timer -= 100;
                if (node.timer <= 0) {
                    pulseHealth -= HEALTH_LOSS_PER_MISS;
                    pulseHealth = Math.max(0, pulseHealth);
                    missed = true;
                    return null; // Mark for removal
                }
                return node;
             }).filter(Boolean); // Remove null entries (missed nodes)


             // Check for game over
             if (pulseHealth <= 0) {
                gameOver = true;
                gameRunning = false;
                stopGameTimers();
                console.log("Game Over! Final Score:", score);
                broadcastGameOver(); // Inform clients
             } else {
                 // Only broadcast if something changed (health drain, node missed/removed)
                 if (missed || (score % 5 === 0) ) { // Broadcast every 5s or on misses
                     broadcastGameState();
                 }
             }

        }, 100); // Run faster loop for smoother timers/health drain

        // Node spawning loop
        function scheduleNextSpawn() {
             if (!gameRunning || gameOver) return;
             const currentInterval = Math.max(NODE_SPAWN_INTERVAL_MIN, NODE_SPAWN_INTERVAL_START - (score * 10)); // Difficulty scaling
             nodeSpawnInterval = setTimeout(() => {
                 spawnNode();
                 scheduleNextSpawn(); // Schedule the next one
             }, currentInterval);
        }
        scheduleNextSpawn(); // Start the spawning chain
    }

    function stopGameTimers() {
        clearInterval(gameLoopInterval);
        clearInterval(scoreInterval);
        clearTimeout(nodeSpawnInterval); // Use clearTimeout for the spawn timer
        gameLoopInterval = null;
        scoreInterval = null;
        nodeSpawnInterval = null;
    }

    function spawnNode() {
        if (!$isHost || !gameRunning || gameOver) return;

        const newNode = {
            id: nextNodeId++,
            x: Math.random() * 80 + 10, // % position, avoid edges
            y: Math.random() * 80 + 10, // % position
            timer: NODE_TIMER_DURATION,
            maxTimer: NODE_TIMER_DURATION,
        };
        nodes = [...nodes, newNode];
        // Don't broadcast here, main loop or click handler will broadcast changes
        // broadcastGameState(); // Avoid broadcasting on every spawn, let loop handle it
    }

    // Called by HOST when a node click is received (or host clicks)
    function handleNodeClick(nodeId, clickerPeerId) {
         if (!$isHost || !gameRunning || gameOver) return; // Only host processes clicks

         const nodeIndex = nodes.findIndex(n => n.id === nodeId);
         if (nodeIndex !== -1) {
             console.log(`Node ${nodeId} clicked successfully by ${clickerPeerId || 'host'}`);
             pulseHealth += HEALTH_GAIN_PER_CLICK;
             pulseHealth = Math.min(MAX_HEALTH, pulseHealth); // Clamp at max

             nodes = nodes.filter(n => n.id !== nodeId); // Remove clicked node

             // Broadcast updated state immediately after successful click
             broadcastGameState();
         } else {
              console.log(`Node ${nodeId} click received, but node doesn't exist (already clicked or missed?).`);
         }
    }

    // --- Player Input Handling (Client and Host) ---
    function onNodeInteraction(nodeId) {
        if (!gameRunning || gameOver) return;

        if ($isHost) {
            // Host clicks directly
            handleNodeClick(nodeId, $peerId); // Pass host's own ID
        } else {
            // Client sends action to host
            console.log(`Client sending click for node ${nodeId}`);
            sendDataToHost({ type: 'playerAction', action: 'clickNode', nodeId: nodeId });
        }
    }

    // --- Broadcasting State (Host Only) ---
    function broadcastGameState() {
        if (!$isHost) return;
        const state = {
             health: pulseHealth,
             score: score,
             nodes: nodes,
             running: gameRunning,
             gameOver: gameOver
        };
        broadcastData({ type: 'gameStateUpdate', state: state });
    }

    function broadcastGameOver() {
        if (!$isHost) return;
        stopGameTimers(); // Ensure timers are stopped on host
        broadcastData({ type: 'gameOver', finalScore: score });
        console.log("Broadcasting Game Over");
    }

    // --- UI Helpers ---
    function getPulseColor(health) {
        const percentage = health / MAX_HEALTH;
        if (percentage > 0.7) return 'lime';
        if (percentage > 0.4) return 'orange';
        return 'red';
    }

    function getNodeStyle(node) {
        const timerPercentage = node.timer / node.maxTimer;
        // Example: size shrinks, color changes
        const size = 20 + 30 * timerPercentage; // Starts larger, shrinks
        const color = `hsl(${120 * timerPercentage}, 100%, 50%)`; // Green -> Red
        return `
            position: absolute;
            left: ${node.x}%;
            top: ${node.y}%;
            width: ${size}px;
            height: ${size}px;
            background-color: ${color};
            border-radius: 50%;
            border: 2px solid white;
            transform: translate(-50%, -50%); /* Center the node */
            cursor: pointer;
            transition: background-color 0.1s, width 0.1s, height 0.1s;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${size * 0.4}px; /* Adjust font size based on node size */
            color: black; /* Text color for node ID */
            font-weight: bold;
        `;
    }

    // Reactive statement to reset game state when connection is lost/reset
     $: if ($connectionStatus === 'disconnected' || $connectionStatus === 'error') {
        if (gameRunning || gameOver) {
            console.log("Connection lost/error, resetting game state.");
            stopGameTimers();
            gameRunning = false;
            gameOver = true; // Set to game over state
            // Optionally clear nodes, health etc. depending on desired UI
            // nodes = [];
            // pulseHealth = 0;
        }
     }

     // Reactive statement for host: start game automatically when first peer connects?
     // $: if ($isHost && $connectedPeers.length > 0 && !gameRunning && !gameOver) {
     //    console.log("First peer connected, starting game...");
     //    startGameHost();
     // }


</script>

<svelte:head>
    <title>SyncPulse Keepers</title>
</svelte:head>

<main class="container">
    <h1>SyncPulse Keepers</h1>

    {#if $connectionStatus === 'disconnected' || $connectionStatus === 'error' || $connectionStatus === 'ready'}
        <section class="lobby">
            <h2>Connect</h2>
            {#if $peerId}
                <p>Your Game ID (Share with friends): <strong>{$peerId}</strong></p>
                <button on:click={startGameHost} disabled={!$peerId || ($connectedPeers.length === 0 && !$isHost) }>Host & Start Game</button>
                <p class="info">({$isHost ? ($connectedPeers.length > 0 ? `${$connectedPeers.length} player(s) connected` : 'Waiting for players...') : 'You can host or join'})</p>
                <hr/>
                 <p>Or Join a Game:</p>
                 <input type="text" placeholder="Enter Host Game ID" bind:value={$gameIdToJoin} />
                 <button on:click={joinGame} disabled={!$gameIdToJoin || !$peerId}>Join Game</button>
             {:else if $connectionStatus === 'connecting'}
                 <p>Connecting to Peer Network...</p>
             {:else if $connectionStatus === 'error'}
                  <p class="error">Error: {$connectionError || 'Could not connect.'}</p>
                  <button on:click={initializePeer}>Retry Connection</button>
             {:else}
                  <p>Initializing Peer Connection...</p>
             {/if}

              {#if $connectionError && $connectionStatus !== 'error'}
                 <p class="error">Error: {$connectionError}</p>
             {/if}
        </section>

    {:else if $connectionStatus === 'connecting'}
        <p>Connecting to {$isHost ? 'network' : `host ${$gameIdToJoin}`}...</p>

    {:else if $connectionStatus === 'connected'}
        <section class="game-area">
            {#if $isHost && !gameRunning && !gameOver}
                 <p>Connected! Your Game ID: <strong>{$peerId}</strong></p>
                 <p>Players connected: {$connectedPeers.length} ({$connectedPeers.join(', ') || 'None'})</p>
                 <button on:click={startGameHost} disabled={gameRunning}>
                     Start Game with {$connectedPeers.length} player(s)
                 </button>
                 <hr/>
            {/if}

             {#if gameRunning || (!$isHost && !gameOver)} <div class="game-stats">
                    <span>Score: {score}</span>
                    <span>Health: {pulseHealth.toFixed(0)}%</span>
                     {#if $isHost}<span>Host</span>{:else}<span>Client</span>{/if}
                     {#if $hostConnection}<span>Connected to: {$hostConnection.peer}</span>{/if}
                 </div>

                 <div class="pulse-container" style="position: relative; width: 400px; height: 400px; border: 1px solid #ccc; margin: 20px auto; background-color: #222;">
                     <div class="pulse-core" style="
                         position: absolute;
                         left: 50%;
                         top: 50%;
                         width: 50px;
                         height: 50px;
                         background-color: {getPulseColor(pulseHealth)};
                         border-radius: 50%;
                         transform: translate(-50%, -50%) scale({1 + Math.sin(Date.now() / 200) * 0.1}); /* Simple pulse effect */
                         transition: background-color 0.5s;
                         box-shadow: 0 0 15px {getPulseColor(pulseHealth)};
                     "></div>

                     {#each nodes as node (node.id)}
                         <div class="node"
                              style={getNodeStyle(node)}
                              on:click={() => onNodeInteraction(node.id)}
                              role="button"
                              tabindex="0"
                         >
                            </div>
                     {/each}
                 </div>

             {:else if gameOver}
                 <div class="game-over">
                     <h2>Game Over!</h2>
                     <p>Final Score: {score}</p>
                      {#if $isHost}
                          <button on:click={startGameHost}>Play Again as Host</button>
                          <p>(Players: {$connectedPeers.join(', ')})</p>
                          <hr/>
                          <button on:click={() => { $connectionStatus = 'ready'; gameOver=false; gameRunning=false; $isHost=false; /* Full reset might need destroyPeer() then init again */ }}>Back to Lobby</button>

                      {:else}
                          <p>Waiting for host...</p>
                          <button on:click={() => { $connectionStatus = 'ready'; gameOver=false; gameRunning=false; /* Full reset might need destroyPeer() then init again */ }}>Back to Lobby</button>
                      {/if}

                 </div>
              {:else if !$isHost && $hostConnection}
                 <p>Connected to host. Waiting for game to start...</p>
              {/if}

        </section>

    {/if}

</main>

<style>
    .container {
        font-family: sans-serif;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        text-align: center;
    }
    .lobby, .game-area, .game-over {
        margin-top: 20px;
        padding: 15px;
        border: 1px solid #eee;
        border-radius: 8px;
    }
    .error {
        color: red;
        font-weight: bold;
    }
    .info {
        font-size: 0.9em;
        color: #555;
    }
    input[type="text"] {
        padding: 8px;
        margin: 0 5px;
        border: 1px solid #ccc;
        border-radius: 4px;
    }
    button {
        padding: 10px 15px;
        margin: 5px;
        border: none;
        border-radius: 4px;
        background-color: #007bff;
        color: white;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    button:hover {
        background-color: #0056b3;
    }
    button:disabled {
        background-color: #aaa;
        cursor: not-allowed;
    }
    .game-stats {
        display: flex;
        justify-content: space-around;
        margin-bottom: 15px;
        font-size: 1.1em;
        background-color: #f0f0f0;
        padding: 10px;
        border-radius: 4px;
    }
    .pulse-container {
        position: relative; /* Needed for absolute positioning of nodes */
        overflow: hidden; /* Prevent nodes spilling out visually */
        background-color: #1a1a1a; /* Dark background */
        border-radius: 10px;
        box-shadow: inset 0 0 10px #000;
    }
    .pulse-core {
         /* Styles are inline for reactivity */
    }
    .node {
        /* Styles are inline for reactivity */
        /* Add box-shadow for better visibility? */
         box-shadow: 0 0 5px rgba(255, 255, 255, 0.7);
    }
     .game-over h2 {
         color: #dc3545;
     }
</style>