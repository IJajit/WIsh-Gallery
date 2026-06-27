(function() {
  let socket = null;
  let retryCount = 0;
  const maxRetries = 10;
  const retryInterval = 1000;
  
  function getSessionKey() {
    // Try query param first
    const params = new URLSearchParams(window.location.search);
    if (params.has('key')) {
      const key = params.get('key');
      try { sessionStorage.setItem('brainstorm-session-key', key); } catch (e) {}
      return key;
    }
    // Fallback to session storage
    try {
      return sessionStorage.getItem('brainstorm-session-key');
    } catch (e) {
      return null;
    }
  }

  function connect() {
    const key = getSessionKey();
    if (!key) {
      console.warn('WebSocket connect failed: no session key found');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?key=${encodeURIComponent(key)}`;
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = function() {
      console.log('Connected to brainstorm server');
      retryCount = 0;
      updateStatus(true);
    };
    
    socket.onmessage = function(event) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'reload') {
          window.location.reload();
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
    
    socket.onclose = function() {
      console.log('Disconnected from brainstorm server');
      updateStatus(false);
      if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(connect, retryInterval);
      }
    };

    socket.onerror = function(err) {
      console.error('WebSocket error:', err);
    };
  }

  function updateStatus(connected) {
    const dot = document.getElementById('connection-dot');
    const text = document.getElementById('connection-text');
    if (dot && text) {
      if (connected) {
        dot.classList.add('connected');
        text.textContent = 'Connected';
      } else {
        dot.classList.remove('connected');
        text.textContent = 'Disconnected';
      }
    }
  }

  window.toggleSelect = function(element) {
    const isSelected = element.classList.contains('selected');
    const container = element.parentElement;
    const isMulti = container && container.hasAttribute('data-multiselect');
    
    if (!isMulti && container) {
      // Clear others
      const options = container.querySelectorAll('.option, .card');
      options.forEach(opt => opt.classList.remove('selected'));
    }
    
    if (isMulti) {
      if (isSelected) {
        element.classList.remove('selected');
      } else {
        element.classList.add('selected');
      }
    } else {
      element.classList.add('selected');
    }
    
    // Send click event via WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
      const choice = element.getAttribute('data-choice');
      const titleEl = element.querySelector('h3');
      const text = titleEl ? titleEl.textContent : '';
      
      socket.send(JSON.stringify({
        type: 'click',
        choice: choice,
        text: text,
        timestamp: Math.floor(Date.now() / 1000)
      }));
    }
  };

  // Start connection
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect);
  } else {
    connect();
  }
})();
