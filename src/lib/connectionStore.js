import { writable } from 'svelte/store';

export const peer = writable(null); // Holds the PeerJS instance
export const peerId = writable(''); // This client's PeerJS ID
export const gameIdToJoin = writable(''); // ID entered by user wanting to join
export const isHost = writable(false); // Is this client the host?
export const connections = writable({}); // Map of peerId -> DataConnection (for host)
export const hostConnection = writable(null); // DataConnection to the host (for clients)
export const connectionStatus = writable('disconnected'); // disconnected, connecting, connected, error
export const connectedPeers = writable([]); // List of connected peer IDs (for host display)
export const connectionError = writable(''); // Store error messages

// --- Core PeerJS Logic (simplified example) ---

let peerInstance = null;
let localPeerId = '';
let currentConnections = {}; // Keep track of connections locally

// Function to initialize PeerJS
export function initializePeer() {
    // Ensure Peer is available (loaded from CDN)
    if (typeof Peer === 'undefined') {
        console.error("PeerJS not loaded yet!");
        connectionError.set("PeerJS library failed to load.");
        connectionStatus.set('error');
        setTimeout(initializePeer, 500); // Retry after a delay
        return;
    }

    // Avoid re-initializing
    if (peerInstance && !peerInstance.destroyed) {
        console.warn("PeerJS already initialized.");
        return peerInstance.id;
    }

    connectionStatus.set('connecting');
    connectionError.set(''); // Clear previous errors

    // Create a new Peer instance. Passing undefined uses the default options
    // (including the public PeerJS signaling server).
    peerInstance = new Peer(undefined, {
        // debug: 2 // Optional: Set debug level (0-3)
        // You might need to configure STUN/TURN servers for reliable connections
        // across different networks, though PeerJS often handles basic cases.
        // config: {'iceServers': [
        //   { urls: 'stun:stun.l.google.com:19302' },
        //   // Add TURN servers here if needed (usually require credentials)
        // ]}
    });
    peer.set(peerInstance);

    peerInstance.on('open', (id) => {
        console.log('My PeerJS ID is:', id);
        localPeerId = id;
        peerId.set(id);
        // If we were trying to connect, status might already be 'connected' via host logic
        if (get(connectionStatus) === 'connecting') {
             // If we weren't explicitly joining, we are potentially hosting now
             // If we *were* joining, the connect() call handles the 'connected' state
        }
        // We are ready, but not necessarily 'connected' in a game sense yet
        connectionStatus.set('ready'); // Or a similar state like 'idle' or 'ready'
    });

    // --- Host Logic: Listen for incoming connections ---
    peerInstance.on('connection', (conn) => {
        console.log(`Incoming connection from ${conn.peer}`);
        connectionStatus.set('connected'); // Host is now connected to at least one peer
        isHost.set(true); // Assume first connection makes you a host if not already joining

        setupConnectionHandlers(conn); // Add to list, set up data handling

        // Optional: Send a welcome message or initial game state
        conn.on('open', () => {
             conn.send({ type: 'welcome', message: 'Connected to host!', hostId: localPeerId });
             // If game is already running, send current state
             // conn.send({ type: 'gameState', state: get(gameStateStore) });
        });
    });

    peerInstance.on('disconnected', () => {
        console.log('PeerJS disconnected from signaling server.');
        connectionStatus.set('disconnected');
        // Attempt to reconnect? PeerJS might do this automatically.
        // Consider calling peerInstance.reconnect() if needed.
    });

    peerInstance.on('close', () => {
         console.log('PeerJS connection closed (destroyed).');
         peer.set(null);
         peerId.set('');
         isHost.set(false);
         connections.set({});
         hostConnection.set(null);
         connectionStatus.set('disconnected');
         connectedPeers.set([]);
         peerInstance = null; // Clear the instance
    });

    peerInstance.on('error', (err) => {
        console.error('PeerJS error:', err);
        connectionError.set(`PeerJS Error: ${err.message} (Type: ${err.type})`);
        connectionStatus.set('error');
        // Handle specific errors (e.g., network, peer-unavailable)
        if (err.type === 'peer-unavailable') {
             // Handle case where trying to connect to non-existent peer
             hostConnection.set(null); // Clear invalid connection attempt
        }
         // Maybe try to cleanup or reset state depending on the error
         // destroyPeer(); // Or just update status
    });

    return localPeerId; // Return the ID that will be assigned
}

// Function for a client to connect to a host
export function connectToHost(hostId) {
    if (!peerInstance || peerInstance.destroyed) {
        console.error("PeerJS not initialized or destroyed.");
        connectionError.set("Cannot connect: PeerJS not ready.");
        return;
    }
    if (!hostId) {
         console.error("No Host ID provided.");
         connectionError.set("Please enter a Host Game ID.");
         return;
    }

    console.log(`Attempting to connect to host: ${hostId}`);
    connectionStatus.set('connecting');
    isHost.set(false); // Explicitly set as client

    const conn = peerInstance.connect(hostId, { reliable: true }); // Use reliable connection
    hostConnection.set(conn); // Store the connection attempt
    setupConnectionHandlers(conn); // Set up handlers immediately

     // 'open' event on the *connection* signifies successful connection
    conn.on('open', () => {
        console.log(`Successfully connected to host: ${conn.peer}`);
        connectionStatus.set('connected');
        // No need to add to connections list for client, hostConnection is enough
    });
}


// --- Common Connection Logic ---
function setupConnectionHandlers(conn) {
    conn.on('data', (data) => {
        console.log(`Data received from ${conn.peer}:`, data);
        // --- PROCESS INCOMING GAME DATA ---
        handleIncomingData(data, conn.peer); // Pass to game logic handler
    });

    conn.on('close', () => {
        console.log(`Connection closed with ${conn.peer}`);
        handleDisconnect(conn.peer);
    });

    conn.on('error', (err) => {
        console.error(`Connection error with ${conn.peer}:`, err);
        connectionError.set(`Connection Error: ${err.message}`);
        // Maybe treat as disconnect or show specific error
        handleDisconnect(conn.peer); // Treat error as disconnect for simplicity
    });

    // If this client is the host, add the connection to the map
    if (get(isHost)) {
        currentConnections[conn.peer] = conn;
        connections.set(currentConnections); // Update store
        connectedPeers.set(Object.keys(currentConnections)); // Update list of peer IDs
    }
}

// Handle Disconnects
function handleDisconnect(peerId) {
    if (get(isHost)) {
        delete currentConnections[peerId];
        connections.set(currentConnections);
        connectedPeers.set(Object.keys(currentConnections));
        // If no peers left, maybe reset host status? Depends on desired behaviour.
        if (Object.keys(currentConnections).length === 0) {
             // connectionStatus.set('ready'); // Or keep as 'connected' but empty?
        }
        // TODO: Inform game logic about the disconnected player
        if (window.handleGameDisconnect) { // Check if game handler exists
             window.handleGameDisconnect(peerId);
        }

    } else {
        // Client disconnected from host
        hostConnection.set(null);
        connectionStatus.set('disconnected');
        connectionError.set('Disconnected from host.');
        // TODO: Trigger game over screen or return to join screen
         if (window.handleGameDisconnect) {
             window.handleGameDisconnect(peerId);
        }
    }
}


// --- Sending Data ---
// Host broadcasts to all clients
export function broadcastData(data) {
    if (!get(isHost)) return; // Only host broadcasts state
    const currentConns = get(connections);
    // console.log("Broadcasting:", data, "to", Object.keys(currentConns).length, "peers");
    for (const peerId in currentConns) {
        if (currentConns[peerId] && currentConns[peerId].open) {
             try {
                currentConns[peerId].send(data);
             } catch (error) {
                 console.error(`Failed to send data to ${peerId}:`, error);
                 // Maybe handle error or remove faulty connection
                 handleDisconnect(peerId);
             }
        }
    }
}

// Client sends data to host
export function sendDataToHost(data) {
    const hostConn = get(hostConnection);
    if (get(isHost) || !hostConn || !hostConn.open) return; // Only clients send to host
    // console.log("Sending to host:", data);
    try {
        hostConn.send(data);
    } catch (error) {
        console.error(`Failed to send data to host ${hostConn.peer}:`, error);
        connectionError.set('Failed to send data to host.');
        handleDisconnect(hostConn.peer); // Assume connection issue
    }
}

// Cleanup on component destroy or navigation
export function destroyPeer() {
    if (peerInstance) {
        console.log("Destroying PeerJS instance");
        peerInstance.destroy(); // This calls the 'close' event handler
    }
     // Reset stores manually just in case 'close' doesn't fire immediately
     peer.set(null);
     peerId.set('');
     isHost.set(false);
     connections.set({});
     hostConnection.set(null);
     connectionStatus.set('disconnected');
     connectedPeers.set([]);
     connectionError.set('');
     peerInstance = null;
     currentConnections = {};
}

// Function to be implemented in the UI component to handle game messages
// We assign it to window for simplicity here, but a more robust Svelte approach
// would use event dispatchers or pass callbacks.
function handleIncomingData(data, senderPeerId) {
     console.log("Placeholder: handleIncomingData", data, senderPeerId);
     if (window.handleGameData) { // Check if the game component has defined the handler
         window.handleGameData(data, senderPeerId);
     } else {
         console.warn("window.handleGameData is not defined in the UI component.");
     }
}


// Expose a global getter for debugging or simple access if needed (use sparingly)
// import { get } from 'svelte/store'; // To use this outside of components
// window.getStoreValue = get;