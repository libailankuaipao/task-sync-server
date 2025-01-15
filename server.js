const WebSocket = require('ws');
const http = require('http');

// 创建 HTTP 服务器来响应健康检查
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket server is running');
});

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ server });

// 存储客户端连接和任务数据
const clients = new Map();
const tasks = new Map();

// 添加心跳检测
function heartbeat() {
    this.isAlive = true;
}

// 广播消息给所有其他客户端
function broadcast(message, sender) {
    const messageStr = JSON.stringify(message);
    clients.forEach((client, id) => {
        if (id !== sender && client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
        }
    });
}

// 定期检查连接状态
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', (ws) => {
    let userId = null;
    ws.isAlive = true;
    ws.on('pong', heartbeat);

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'auth':
                    userId = message.data.userId;
                    clients.set(userId, ws);
                    // 发送当前任务数据给新连接的客户端
                    const currentTasks = Array.from(tasks.values());
                    ws.send(JSON.stringify({
                        type: 'initTasks',
                        data: currentTasks
                    }));
                    console.log(`用户 ${userId} 已连接`);
                    break;

                case 'updateTask':
                    const task = message.data;
                    tasks.set(task.id, task);
                    // 广播任务更新
                    broadcast({
                        type: 'taskUpdated',
                        data: task
                    }, userId);
                    console.log(`任务 ${task.id} 已更新`);
                    break;

                case 'deleteTask':
                    const taskId = message.data.taskId;
                    tasks.delete(taskId);
                    // 广播任务删除
                    broadcast({
                        type: 'taskDeleted',
                        data: { taskId }
                    }, userId);
                    console.log(`任务 ${taskId} 已删除`);
                    break;
            }
        } catch (error) {
            console.error('处理消息时出错:', error);
        }
    });

    ws.on('close', () => {
        if (userId) {
            clients.delete(userId);
            console.log(`用户 ${userId} 断开连接`);
        }
    });
});

wss.on('close', () => {
    clearInterval(interval);
});

server.listen(PORT, () => {
    console.log(`服务器启动在端口 ${PORT}`);
});
