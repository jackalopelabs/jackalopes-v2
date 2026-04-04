// Update the checkServerAvailability method to reduce error noise
async checkServerAvailability(url: string): Promise<boolean> {
  try {
    // Extract domain from WebSocket URL
    let domain = url.replace('ws://', '').replace('wss://', '').split('/')[0];
    // Make it HTTP(S) format for health check
    let healthUrl = `http${url.startsWith('wss') ? 's' : ''}://${domain}/health-check`;
    
    console.log(`Checking server availability at domain ${domain}...`);
    
    // Try to fetch the health endpoint with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    try {
      const response = await fetch(healthUrl, { 
        method: 'HEAD',
        mode: 'cors',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log(`Domain ${domain} is reachable, attempting WebSocket connection...`);
        return true;
      } else {
        console.log(`Health check failed with status: ${response.status}`);
        return false;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Don't log the full error for connection issues - it's noisy
      // Just show a simpler message
      console.log(`Server ${domain} is unreachable - using offline mode`);
      
      // Throttle error events to once per 10 seconds
      if (!this.lastErrorTime || (Date.now() - this.lastErrorTime) > 10000) {
        this.lastErrorTime = Date.now();
        this.emit('server_unreachable');
      }
      
      return false;
    }
  } catch (error) {
    console.log('Error checking server availability, defaulting to offline mode');
    return false;
  }
} 