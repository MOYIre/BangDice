// WebUI 客户端脚本
document.addEventListener('DOMContentLoaded', function() {
    const socket = io();
    
    // XSS 防护：HTML转义函数
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
    
    // DOM 元素
    const tabs = document.querySelectorAll('.tab-content');
    const navButtons = document.querySelectorAll('.nav-btn');
    const connectionStatus = document.getElementById('connection-status');
    const messageCount = document.getElementById('message-count');
    const logsContainer = document.getElementById('logs-container');
    const commandInput = document.getElementById('command-input');
    const sendCommandBtn = document.getElementById('send-command');
    const configForm = document.getElementById('config-form');
    
    
    // 当前计数器
    let messageCounter = 0;
    
    // 切换标签页
    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            
            // 更新导航按钮状态
            navButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // 显示对应的标签页
            tabs.forEach(tab => tab.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
        });
    });
    
    // 发送命令功能
    sendCommandBtn.addEventListener('click', sendCommand);
    commandInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendCommand();
        }
    });
    
    function sendCommand() {
        const command = commandInput.value.trim();
        if (command) {
            // 发送命令到服务器
            socket.emit('send_command', {
                command: command,
                timestamp: new Date().toISOString()
            });
            
            // 清空输入框
            commandInput.value = '';
            
            // 在日志中显示发送的命令
            addLogMessage({
                type: 'command',
                content: command,
                timestamp: new Date().toLocaleString(),
                isSent: true
            });
        }
    }
    
    // 提交配置表单
    configForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = {
            wsUrl: document.getElementById('ws-url').value,
            accessToken: document.getElementById('access-token').value
        };
        
        socket.emit('update_config', formData);
    });
    
    // 连接 OneBot 按钮
    document.getElementById('connect-onebot').addEventListener('click', function() {
        const formData = {
            wsUrl: document.getElementById('ws-url').value,
            accessToken: document.getElementById('access-token').value
        };
        
        socket.emit('connect_onebot', formData);
    });
    
    // 断开 OneBot 连接按钮
    document.getElementById('disconnect-onebot').addEventListener('click', function() {
        socket.emit('disconnect_onebot');
    });
    
    
    
    // 刷新插件列表
    document.getElementById('refresh-plugins').addEventListener('click', function() {
        socket.emit('get_plugins');
    });
    
    // 刷新角色列表
    document.getElementById('refresh-players').addEventListener('click', function() {
        socket.emit('get_players');
    });
    
    // 清空日志
    document.getElementById('clear-logs').addEventListener('click', function() {
        logsContainer.innerHTML = '';
        messageCounter = 0;
        updateMessageCount();
    });
    
    // Socket.IO 事件监听
    socket.on('connect', function() {
        console.log('已连接到服务器');
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', function() {
        console.log('与服务器断开连接');
        updateConnectionStatus(false);
    });
    
    socket.on('message', function(data) {
        addLogMessage(data);
        incrementMessageCount();
    });
    
    socket.on('status_update', function(data) {
        document.getElementById('active-groups').textContent = data.activeGroups || 0;
        document.getElementById('active-plugins').textContent = data.activePlugins || 0;
        
        // 更新 OneBot 连接状态
        if (data.connected !== undefined) {
            updateOnebotConnectionStatus(data.connected);
        }
    });
    
    socket.on('config_update', function(data) {
        document.getElementById('ws-url').value = data.wsUrl || '';
        document.getElementById('access-token').value = data.accessToken || '';
    });
    
    socket.on('onebot_status_update', function(data) {
        updateOnebotConnectionStatus(data.connected);
    });
    
    
    
    socket.on('plugins_list', function(data) {
        updatePluginsList(data);
    });
    
    socket.on('players_list', function(data) {
        updatePlayersList(data);
    });
    
    // 更新连接状态显示
    function updateConnectionStatus(connected) {
        const statusDot = connectionStatus.querySelector('.status-dot');
        const statusText = connectionStatus.querySelector('.status-text');
        
        if (connected) {
            statusDot.className = 'status-dot connected';
            statusText.textContent = '已连接';
        } else {
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = '已断开';
        }
    }
    
    
    
    // 添加日志消息
    function addLogMessage(data) {
        const logEntry = document.createElement('div');
        logEntry.className = `log-message ${data.type}-message`;
        
        const timestamp = data.timestamp || new Date().toLocaleString();
        const prefix = data.isSent ? '[发送] ' : '[接收] ';
        
        logEntry.innerHTML = `
            <span class="timestamp">[${escapeHtml(timestamp)}]</span>
            ${data.groupId ? `<span class="group-id">${escapeHtml(data.groupId)}</span> ` : ''}
            ${escapeHtml(prefix)}${escapeHtml(data.content)}
        `;
        
        logsContainer.appendChild(logEntry);
        
        // 自动滚动到底部
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }
    
    // 更新 OneBot 连接状态显示
    function updateOnebotConnectionStatus(connected) {
        const onebotStatusDot = document.querySelector('.onebot-status-dot');
        const onebotStatusText = document.querySelector('.onebot-status-text');
        
        if (onebotStatusDot && onebotStatusText) {
            if (connected) {
                onebotStatusDot.className = 'onebot-status-dot connected';
                onebotStatusText.textContent = '已连接';
            } else {
                onebotStatusDot.className = 'onebot-status-dot disconnected';
                onebotStatusText.textContent = '已断开';
            }
        }
    }
    
    // 更新消息计数
    function incrementMessageCount() {
        messageCounter++;
        updateMessageCount();
    }
    
    function updateMessageCount() {
        messageCount.textContent = messageCounter;
    }
    
    // 更新插件列表
    function updatePluginsList(plugins) {
        const container = document.getElementById('plugins-container');
        
        if (!plugins || plugins.length === 0) {
            container.innerHTML = '<div class="plugin-card empty"><p>未找到插件</p></div>';
            return;
        }
        
        container.innerHTML = '';
        
        plugins.forEach(plugin => {
            const pluginCard = document.createElement('div');
            pluginCard.className = 'plugin-card';
            pluginCard.setAttribute('data-plugin', escapeHtml(plugin.name));
            
            pluginCard.innerHTML = `
                <div class="plugin-header">
                    <h4>${escapeHtml(plugin.name)} (${escapeHtml(plugin.command || '无命令')})</h4>
                    <span class="plugin-status ${plugin.enabled ? 'active' : 'inactive'}">
                        ${plugin.enabled ? '已启用' : '已禁用'}
                    </span>
                </div>
                <p class="plugin-author">作者: ${escapeHtml(plugin.author || '未知')}</p>
                <p class="plugin-desc">${escapeHtml(plugin.description || '暂无描述')}</p>
                <div class="plugin-actions">
                    <button class="btn-${plugin.enabled ? 'disable' : 'enable'}" 
                            data-plugin="${escapeHtml(plugin.name)}" 
                            data-action="${plugin.enabled ? 'disable' : 'enable'}">
                        ${plugin.enabled ? '禁用' : '启用'}
                    </button>
                </div>
            `;
            
            container.appendChild(pluginCard);
        });
        
        // 添加插件操作事件监听
        document.querySelectorAll('.plugin-actions button').forEach(button => {
            button.addEventListener('click', function() {
                const pluginName = this.getAttribute('data-plugin');
                const action = this.getAttribute('data-action');
                
                socket.emit('plugin_action', {
                    plugin: pluginName,
                    action: action
                });
            });
        });
    }
    
    // 更新角色列表
    function updatePlayersList(players) {
        const container = document.getElementById('players-container');
        
        if (!players || Object.keys(players).length === 0) {
            container.innerHTML = '<div class="player-card empty"><p>暂无角色数据</p></div>';
            return;
        }
        
        container.innerHTML = '';
        
        for (const [groupId, groupPlayers] of Object.entries(players)) {
            for (const [userId, playerData] of Object.entries(groupPlayers)) {
                const playerCard = document.createElement('div');
                playerCard.className = 'player-card';
                
                // 显示角色基础信息
                playerCard.innerHTML = `
                    <h4>${escapeHtml(playerData.name || '未命名角色')}</h4>
                    <p><strong>群组:</strong> ${escapeHtml(groupId)}</p>
                    <p><strong>用户:</strong> ${escapeHtml(userId)}</p>
                    ${playerData.attrs ? `
                    <div class="player-stats">
                        ${Object.entries(playerData.attrs).slice(0, 4).map(([key, value]) => `
                            <div class="stat-item">
                                <div class="stat-value">${escapeHtml(String(value))}</div>
                                <div class="stat-label">${escapeHtml(key)}</div>
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}
                `;
                
                container.appendChild(playerCard);
            }
        }
    }
    
    
    
    // 初始化时请求配置信息
    socket.emit('get_config');
    
    // 初始状态更新
    updateConnectionStatus(false);
    updateMessageCount();
});

// 导出函数供其他脚本使用
window.BangDiceWebUI = {
    // 可以添加全局函数
};