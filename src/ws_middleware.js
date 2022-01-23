const WebSocketServer = require("ws").Server;
const { randomBytes } = require("crypto");

const WsType = { emit: (event = '', data)=>{}, onEvent: (event = '', callback = () => (any))=>()=>{}, close: ()=>{} }

module.exports = function useWS(callback = (socket = WsType)=>{}) {
	const server = new WebSocketServer({ noServer: true });
	server.on('connection', function(socket) {

		function wsProcessor(data, isBinary) {
			if(isBinary) {
				const headerLen = data.readInt32LE();
				const header = JSON.parse(data.slice(4, headerLen + 4).toString('utf-8'));
				const body = data.slice(headerLen + 4);
				return { ...header, data: body };
			} else {
				const meta = JSON.parse(data.toString('utf-8'));
				return meta;
			}
		}

		function wsPacker(meta, data) {
			if(Buffer.isBuffer(data)) {
				const header = Buffer.from(JSON.stringify(meta), 'utf-8');
				const len = Buffer.allocUnsafe(4);
				len.writeInt32LE(header.length);
				return Buffer.concat([len, header, data]);
			} else {
				return JSON.stringify({ ...meta, data: data || {} });
			}
		}

		function onEvent(event, callback) {

			async function handler(data, isBinary) {
				const meta = wsProcessor(data, isBinary);
				if(event === meta.event) socket.send(wsPacker({event, id: meta.id, complete: true}, await callback(meta.data)));
			}

			socket.on('message', handler);
			return () => socket.removeListener('message', handler);
		}

		async function emit(event, data) {

			const id = randomBytes(8).toString('hex');

			return await new Promise(resolve => {
				function completeHandler(data, isBinary){
					const meta = wsProcessor(data, isBinary);
					if(meta.complete && meta.event === event && meta.id === id) {
						socket.removeListener('message', completeHandler)
						resolve(meta.data);
					}
				}
				socket.on('message', completeHandler);
				socket.send(wsPacker({ event, id }, data));
			})
		}

		function close(){
			emit('close');
			socket.removeAllListeners('message');
			socket.close();
		}

		onEvent('close', () => {
			socket.removeAllListeners();
			socket.close();
		})

		callback({ emit, onEvent, close });

	});

	return req => req.headers.connection.toLowerCase() === 'upgrade' ? server.handleUpgrade(req, req.socket, req.socket.read() || [], ws => server.emit('connection', ws, req)) : req.next();
}