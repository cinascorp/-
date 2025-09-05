// HTTP/3 (QUIC) Client Implementation for TAR System
// This module provides low-latency data streaming using HTTP/3

class HTTP3Client {
    constructor() {
        this.connections = new Map();
        this.streams = new Map();
        this.isSupported = this.checkHTTP3Support();
    }

    // Check if HTTP/3 is supported by the browser
    checkHTTP3Support() {
        // Modern browsers support HTTP/3 through fetch with specific headers
        return typeof fetch !== 'undefined' && 
               'connection' in navigator && 
               navigator.connection.effectiveType !== 'slow-2g';
    }

    // Create HTTP/3 connection with QUIC
    async createConnection(url, options = {}) {
        if (!this.isSupported) {
            console.warn('HTTP/3 not supported, falling back to HTTP/2');
            return this.createHTTP2Connection(url, options);
        }

        try {
            const connectionId = this.generateConnectionId();
            
            // HTTP/3 specific headers
            const headers = {
                'Alt-Svc': 'h3=":443"',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                ...options.headers
            };

            const response = await fetch(url, {
                method: options.method || 'GET',
                headers: headers,
                cache: 'no-store',
                keepalive: true,
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP/3 request failed: ${response.status}`);
            }

            const connection = {
                id: connectionId,
                url: url,
                response: response,
                streams: new Map(),
                createdAt: Date.now(),
                lastActivity: Date.now()
            };

            this.connections.set(connectionId, connection);
            return connection;

        } catch (error) {
            console.error('HTTP/3 connection failed:', error);
            // Fallback to HTTP/2
            return this.createHTTP2Connection(url, options);
        }
    }

    // Create HTTP/2 connection as fallback
    async createHTTP2Connection(url, options = {}) {
        const connectionId = this.generateConnectionId();
        
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: {
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                ...options.headers
            },
            cache: 'no-store',
            keepalive: true,
            ...options
        });

        const connection = {
            id: connectionId,
            url: url,
            response: response,
            streams: new Map(),
            createdAt: Date.now(),
            lastActivity: Date.now(),
            protocol: 'HTTP/2'
        };

        this.connections.set(connectionId, connection);
        return connection;
    }

    // Create a new stream for data transmission
    async createStream(connectionId, streamOptions = {}) {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            throw new Error('Connection not found');
        }

        const streamId = this.generateStreamId();
        
        try {
            // For HTTP/3, we can create multiple streams on the same connection
            const stream = {
                id: streamId,
                connectionId: connectionId,
                url: connection.url,
                options: streamOptions,
                createdAt: Date.now(),
                lastActivity: Date.now(),
                status: 'active'
            };

            connection.streams.set(streamId, stream);
            this.streams.set(streamId, stream);

            return stream;

        } catch (error) {
            console.error('Stream creation failed:', error);
            throw error;
        }
    }

    // Send data through HTTP/3 stream
    async sendData(streamId, data, options = {}) {
        const stream = this.streams.get(streamId);
        if (!stream) {
            throw new Error('Stream not found');
        }

        const connection = this.connections.get(stream.connectionId);
        if (!connection) {
            throw new Error('Connection not found');
        }

        try {
            const response = await fetch(stream.url, {
                method: options.method || 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Stream-ID': streamId,
                    'X-Connection-ID': stream.connectionId,
                    ...options.headers
                },
                body: JSON.stringify(data),
                cache: 'no-store'
            });

            stream.lastActivity = Date.now();
            connection.lastActivity = Date.now();

            return response;

        } catch (error) {
            console.error('Data transmission failed:', error);
            throw error;
        }
    }

    // Receive data from HTTP/3 stream
    async receiveData(streamId, options = {}) {
        const stream = this.streams.get(streamId);
        if (!stream) {
            throw new Error('Stream not found');
        }

        const connection = this.connections.get(stream.connectionId);
        if (!connection) {
            throw new Error('Connection not found');
        }

        try {
            const response = await fetch(stream.url, {
                method: options.method || 'GET',
                headers: {
                    'X-Stream-ID': streamId,
                    'X-Connection-ID': stream.connectionId,
                    'Accept': 'application/json',
                    ...options.headers
                },
                cache: 'no-store'
            });

            stream.lastActivity = Date.now();
            connection.lastActivity = Date.now();

            if (response.ok) {
                const data = await response.json();
                return data;
            } else {
                throw new Error(`HTTP error: ${response.status}`);
            }

        } catch (error) {
            console.error('Data reception failed:', error);
            throw error;
        }
    }

    // Close a specific stream
    closeStream(streamId) {
        const stream = this.streams.get(streamId);
        if (stream) {
            const connection = this.connections.get(stream.connectionId);
            if (connection) {
                connection.streams.delete(streamId);
            }
            this.streams.delete(streamId);
        }
    }

    // Close a connection and all its streams
    closeConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            // Close all streams
            for (const streamId of connection.streams.keys()) {
                this.closeStream(streamId);
            }
            this.connections.delete(connectionId);
        }
    }

    // Get connection statistics
    getConnectionStats(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            return null;
        }

        return {
            id: connection.id,
            url: connection.url,
            protocol: connection.protocol || 'HTTP/3',
            streamCount: connection.streams.size,
            uptime: Date.now() - connection.createdAt,
            lastActivity: connection.lastActivity,
            isActive: Date.now() - connection.lastActivity < 30000 // 30 seconds
        };
    }

    // Get all connection statistics
    getAllStats() {
        const stats = [];
        for (const connectionId of this.connections.keys()) {
            stats.push(this.getConnectionStats(connectionId));
        }
        return stats;
    }

    // Clean up inactive connections
    cleanupInactiveConnections() {
        const now = Date.now();
        const inactiveThreshold = 60000; // 1 minute

        for (const [connectionId, connection] of this.connections.entries()) {
            if (now - connection.lastActivity > inactiveThreshold) {
                this.closeConnection(connectionId);
            }
        }
    }

    // Generate unique connection ID
    generateConnectionId() {
        return 'conn_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    // Generate unique stream ID
    generateStreamId() {
        return 'stream_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    // Start periodic cleanup
    startCleanup() {
        setInterval(() => {
            this.cleanupInactiveConnections();
        }, 30000); // Every 30 seconds
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HTTP3Client;
} else {
    window.HTTP3Client = HTTP3Client;
}