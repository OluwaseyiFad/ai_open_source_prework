class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldSize = 2048; // 2048x2048 world map
        
        // Game state
        this.players = {};
        this.avatars = {};
        this.myPlayerId = null;
        this.websocket = null;
        
        // Camera/viewport
        this.viewportOffsetX = 0;
        this.viewportOffsetY = 0;
        
        // Movement state
        this.pressedKeys = new Set();
        this.isMoving = false;
        this.movementInterval = null;
        
        // Reconnection state
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectInterval = null;
        
        this.init();
    }
    
    init() {
        // Bind event handlers once
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleResize = this.handleResize.bind(this);
        
        this.setupCanvas();
        this.loadWorldMap();
        this.setupKeyboardControls();
        this.connectToServer();
    }
    
    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle window resize
        window.addEventListener('resize', this.handleResize);
    }
    
    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.draw();
        };
        this.worldImage.onerror = () => {
            console.error('Failed to load world map image');
        };
        this.worldImage.src = 'world.jpg';
    }
    
    drawWorld() {
        if (!this.worldImage) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw the world map with viewport offset
        this.ctx.drawImage(
            this.worldImage,
            this.viewportOffsetX, this.viewportOffsetY, this.canvas.width, this.canvas.height,  // Source: viewport area
            0, 0, this.canvas.width, this.canvas.height  // Destination: full canvas
        );
    }
    
    connectToServer() {
        // Prevent multiple connections
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected');
            return;
        }
        
        try {
            this.websocket = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.websocket.onopen = () => {
                console.log('Connected to game server');
                this.reconnectAttempts = 0; // Reset reconnection attempts on successful connection
                this.joinGame();
            };
            
            this.websocket.onmessage = (event) => {
                this.handleServerMessage(JSON.parse(event.data));
            };
            
            this.websocket.onclose = () => {
                console.log('Disconnected from game server');
                this.handleDisconnection();
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to connect to server:', error);
        }
    }
    
    joinGame() {
        const joinMessage = {
            action: 'join_game',
            username: 'Oluwaseyi'
        };
        
        this.websocket.send(JSON.stringify(joinMessage));
    }
    
    handleDisconnection() {
        // Clear any existing reconnection interval
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        
        // Check if we should attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(3000 * this.reconnectAttempts, 30000); // Exponential backoff, max 30 seconds
            
            console.log(`Attempting to reconnect in ${delay/1000} seconds... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            this.reconnectInterval = setTimeout(() => {
                console.log('Attempting to reconnect...');
                this.connectToServer();
            }, delay);
        } else {
            console.log('Max reconnection attempts reached. Please refresh the page to try again.');
        }
    }
    
    // Cleanup method to prevent duplicate connections
    destroy() {
        console.log('Destroying game client...');
        
        // Stop movement
        this.stopContinuousMovement();
        
        // Clear reconnection interval
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        
        // Close WebSocket connection
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        
        // Clear game state
        this.players = {};
        this.avatars = {};
        this.myPlayerId = null;
        this.pressedKeys.clear();
        this.isMoving = false;
        
        // Remove event listeners
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('resize', this.handleResize);
        
        console.log('Game client destroyed');
    }
    
    setupKeyboardControls() {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    }
    
    handleResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.updateCamera();
        this.draw();
    }
    
    handleKeyDown(event) {
        // Prevent default arrow key behavior (page scrolling)
        if (this.isArrowKey(event.key)) {
            event.preventDefault();
            
            // Only start movement if this key wasn't already pressed
            if (!this.pressedKeys.has(event.key)) {
                this.pressedKeys.add(event.key);
                this.startContinuousMovement();
            }
        }
    }
    
    handleKeyUp(event) {
        if (this.isArrowKey(event.key)) {
            event.preventDefault();
            
            this.pressedKeys.delete(event.key);
            
            if (this.pressedKeys.size === 0) {
                // No keys pressed, stop movement
                this.stopContinuousMovement();
            } else {
                // Other keys still pressed, continue with current direction
                this.startContinuousMovement();
            }
        }
    }
    
    isArrowKey(key) {
        return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key);
    }
    
    getDirection(key) {
        const directionMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        };
        return directionMap[key];
    }
    
    getCombinedDirection() {
        const pressedKeys = Array.from(this.pressedKeys);
        
        // If only one key pressed, return that direction
        if (pressedKeys.length === 1) {
            return this.getDirection(pressedKeys[0]);
        }
        
        // If multiple keys pressed, determine diagonal direction
        const hasUp = pressedKeys.includes('ArrowUp');
        const hasDown = pressedKeys.includes('ArrowDown');
        const hasLeft = pressedKeys.includes('ArrowLeft');
        const hasRight = pressedKeys.includes('ArrowRight');
        
        // Handle diagonal combinations
        if (hasUp && hasRight) return 'up-right';
        if (hasUp && hasLeft) return 'up-left';
        if (hasDown && hasRight) return 'down-right';
        if (hasDown && hasLeft) return 'down-left';
        
        // Handle opposite directions (shouldn't happen, but fallback)
        if (hasUp && hasDown) return 'up'; // Prefer up
        if (hasLeft && hasRight) return 'left'; // Prefer left
        
        // Fallback to first pressed key
        return this.getDirection(pressedKeys[0]);
    }
    
    getDiagonalTargetPosition() {
        if (!this.myPlayerId || !this.players[this.myPlayerId]) return null;
        
        const myPlayer = this.players[this.myPlayerId];
        const pressedKeys = Array.from(this.pressedKeys);
        
        // If only one key pressed, use direction-based movement
        if (pressedKeys.length === 1) {
            return null; // Will use direction-based movement
        }
        
        // Calculate diagonal movement target
        const hasUp = pressedKeys.includes('ArrowUp');
        const hasDown = pressedKeys.includes('ArrowDown');
        const hasLeft = pressedKeys.includes('ArrowLeft');
        const hasRight = pressedKeys.includes('ArrowRight');
        
        // Calculate movement distance (adjust as needed)
        const moveDistance = 50; // pixels per movement step
        
        let deltaX = 0;
        let deltaY = 0;
        
        if (hasUp) deltaY -= moveDistance;
        if (hasDown) deltaY += moveDistance;
        if (hasLeft) deltaX -= moveDistance;
        if (hasRight) deltaX += moveDistance;
        
        // Calculate target position
        const targetX = myPlayer.x + deltaX;
        const targetY = myPlayer.y + deltaY;
        
        // Clamp to map boundaries
        const clampedX = Math.max(0, Math.min(targetX, this.worldSize));
        const clampedY = Math.max(0, Math.min(targetY, this.worldSize));
        
        return { x: clampedX, y: clampedY };
    }
    
    sendMoveCommand(direction) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            // Check if this is a diagonal direction that needs coordinate-based movement
            const diagonalTarget = this.getDiagonalTargetPosition();
            
            if (diagonalTarget) {
                // Use coordinate-based movement for diagonal directions
                const moveMessage = {
                    action: 'move',
                    x: diagonalTarget.x,
                    y: diagonalTarget.y
                };
                this.websocket.send(JSON.stringify(moveMessage));
                console.log('Sent diagonal move command:', diagonalTarget);
            } else {
                // Use direction-based movement for single directions
                const moveMessage = {
                    action: 'move',
                    direction: direction
                };
                this.websocket.send(JSON.stringify(moveMessage));
                console.log('Sent direction move command:', direction);
            }
        }
    }
    
    sendStopCommand() {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            const stopMessage = {
                action: 'stop'
            };
            this.websocket.send(JSON.stringify(stopMessage));
            console.log('Sent stop command');
        }
    }
    
    startContinuousMovement() {
        // Clear any existing movement interval
        this.stopContinuousMovement();
        
        if (this.pressedKeys.size === 0) return;
        
        // Get the combined direction from all pressed keys
        const direction = this.getCombinedDirection();
        
        // Send initial move command
        this.sendMoveCommand(direction);
        this.isMoving = true;
        
        // Set up continuous movement (send move command every 100ms)
        this.movementInterval = setInterval(() => {
            if (this.pressedKeys.size > 0) {
                const direction = this.getCombinedDirection();
                this.sendMoveCommand(direction);
            }
        }, 100);
        
        console.log('Started continuous movement:', direction);
    }
    
    stopContinuousMovement() {
        // Clear the movement interval
        if (this.movementInterval) {
            clearInterval(this.movementInterval);
            this.movementInterval = null;
        }
        
        // Send stop command
        this.sendStopCommand();
        this.isMoving = false;
        
        console.log('Stopped continuous movement');
    }
    
    handleServerMessage(message) {
        console.log('Received message:', message);
        
        switch (message.action) {
            case 'join_game':
                if (message.success) {
                    console.log('Join game successful:', message);
                    this.myPlayerId = message.playerId;
                    this.players = message.players;
                    this.avatars = message.avatars;
                    console.log('My player ID:', this.myPlayerId);
                    console.log('Players:', this.players);
                    console.log('My player data:', this.players[this.myPlayerId]);
                    this.loadAvatars();
                    this.updateCamera();
                    this.draw();
                } else {
                    console.error('Failed to join game:', message.error);
                }
                break;
                
            case 'player_joined':
                this.players[message.player.id] = message.player;
                this.avatars[message.avatar.name] = message.avatar;
                this.loadAvatar(message.avatar);
                this.draw();
                break;
                
            case 'players_moved':
                Object.assign(this.players, message.players);
                this.updateCamera();
                this.draw();
                break;
                
            case 'player_left':
                delete this.players[message.playerId];
                this.draw();
                break;
                
            default:
                console.log('Unknown message type:', message.action);
        }
    }
    
    loadAvatars() {
        for (const avatarName in this.avatars) {
            this.loadAvatar(this.avatars[avatarName]);
        }
    }
    
    loadAvatar(avatar) {
        const directions = ['north', 'south', 'east'];
        
        for (const direction of directions) {
            if (avatar.frames[direction]) {
                for (let i = 0; i < avatar.frames[direction].length; i++) {
                    const img = new Image();
                    img.onload = () => this.draw();
                    img.src = avatar.frames[direction][i];
                    
                    if (!avatar.images) avatar.images = {};
                    if (!avatar.images[direction]) avatar.images[direction] = [];
                    avatar.images[direction][i] = img;
                }
            }
        }
    }
    
    updateCamera() {
        if (!this.myPlayerId || !this.players[this.myPlayerId]) {
            console.log('Camera update skipped - myPlayerId:', this.myPlayerId, 'players:', this.players);
            return;
        }
        
        const myPlayer = this.players[this.myPlayerId];
        console.log('Updating camera for player:', myPlayer);
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // Calculate the top-left corner of the viewport to center the player
        // We want the player at (myPlayer.x, myPlayer.y) to appear at (centerX, centerY)
        // So the viewport should start at (myPlayer.x - centerX, myPlayer.y - centerY)
        this.viewportOffsetX = myPlayer.x - centerX;
        this.viewportOffsetY = myPlayer.y - centerY;
        
        // Clamp to map boundaries to prevent showing outside the map
        this.viewportOffsetX = Math.max(0, Math.min(this.viewportOffsetX, this.worldSize - this.canvas.width));
        this.viewportOffsetY = Math.max(0, Math.min(this.viewportOffsetY, this.worldSize - this.canvas.height));
        
        console.log('Viewport offset:', this.viewportOffsetX, this.viewportOffsetY);
        console.log('Player world position:', myPlayer.x, myPlayer.y);
        console.log('Player screen position will be:', myPlayer.x - this.viewportOffsetX, myPlayer.y - this.viewportOffsetY);
    }
    
    draw() {
        this.drawWorld();
        this.drawPlayers();
        this.drawConnectionStatus();
        this.drawPlayerCount();
        this.drawControls();
    }
    
    drawPlayers() {
        for (const playerId in this.players) {
            this.drawPlayer(this.players[playerId]);
        }
    }
    
    drawPlayer(player) {
        const avatar = this.avatars[player.avatar];
        if (!avatar || !avatar.images) {
            return;
        }
        
        // Calculate screen position
        const screenX = player.x - this.viewportOffsetX;
        const screenY = player.y - this.viewportOffsetY;
        
        // Skip if player is outside viewport
        if (screenX < -50 || screenX > this.canvas.width + 50 || 
            screenY < -50 || screenY > this.canvas.height + 50) {
            return;
        }
        
        // Check if this is my player and if I'm moving
        const isMyPlayer = player.id === this.myPlayerId;
        const isMoving = isMyPlayer && this.isMoving;
        
        // Get the correct direction and frame
        let direction = player.facing;
        if (direction === 'west') {
            direction = 'east'; // West uses flipped east frames
        }
        
        const frame = player.animationFrame || 0;
        const avatarImg = avatar.images[direction] && avatar.images[direction][frame];
        
        if (avatarImg) {
            // Calculate avatar size (assuming 32x32 base size)
            const avatarSize = 32;
            const avatarX = screenX - avatarSize / 2;
            const avatarY = screenY - avatarSize;
            
            // Draw visual feedback (highlight) if moving
            if (isMoving) {
                this.ctx.save();
                this.ctx.globalAlpha = 0.3;
                this.ctx.fillStyle = '#00ff00'; // Green highlight
                this.ctx.fillRect(avatarX - 2, avatarY - 2, avatarSize + 4, avatarSize + 4);
                this.ctx.globalAlpha = 1.0;
                this.ctx.restore();
            }
            
            // Draw avatar
            if (player.facing === 'west') {
                // Flip horizontally for west direction
                this.ctx.save();
                this.ctx.scale(-1, 1);
                this.ctx.drawImage(avatarImg, -avatarX - avatarSize, avatarY, avatarSize, avatarSize);
                this.ctx.restore();
            } else {
                this.ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
            }
        }
        
        // Draw username label with background
        const labelX = screenX;
        const labelY = screenY - 40;
        const textWidth = this.ctx.measureText(player.username).width;
        const padding = 6;
        
        // Draw background rectangle
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(
            labelX - textWidth/2 - padding, 
            labelY - 12, 
            textWidth + padding * 2, 
            16
        );
        
        // Draw username text
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.username, labelX, labelY);
    }
    
    drawConnectionStatus() {
        // Determine connection status
        const isConnected = this.websocket && this.websocket.readyState === WebSocket.OPEN;
        const statusText = isConnected ? 'Connected' : 'Disconnected';
        const statusColor = isConnected ? '#00ff00' : '#ff0000';
        
        // Draw background for better visibility
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(10, 10, 120, 25);
        
        // Draw status indicator dot
        this.ctx.fillStyle = statusColor;
        this.ctx.fillRect(15, 15, 8, 8);
        
        // Draw status text
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Arial';
        this.ctx.fillText(statusText, 30, 22);
    }
    
    drawPlayerCount() {
        const count = Object.keys(this.players).length;
        
        // Draw background for better visibility
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(this.canvas.width - 120, 10, 110, 25);
        
        // Draw player count text
        this.ctx.fillStyle = 'white';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Players: ${count}`, this.canvas.width - 115, 25);
        
        // Reset text alignment for other elements
        this.ctx.textAlign = 'center';
    }
    
    drawControls() {
        // Draw background for better visibility
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(10, this.canvas.height - 60, 250, 50);
        
        // Draw control instructions
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('Use arrow keys to move', 15, this.canvas.height - 40);
        this.ctx.fillText('Hold keys for continuous movement', 15, this.canvas.height - 25);
        
        // Reset text alignment for other elements
        this.ctx.textAlign = 'center';
    }
}

// Global game instance to prevent multiple instances
let gameInstance = null;

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Clean up any existing instance
    if (gameInstance) {
        gameInstance.destroy();
    }
    
    // Create new instance
    gameInstance = new GameClient();
});

// Clean up when page is unloaded
window.addEventListener('beforeunload', () => {
    if (gameInstance) {
        gameInstance.destroy();
    }
});

// Clean up when page is hidden (tab switch, etc.)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameInstance) {
        gameInstance.destroy();
    }
});
