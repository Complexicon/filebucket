async function websocket(path = '/', customWS){

	let host = location.host;

	const ws = customWS || new WebSocket('ws://' + host + path);
	
	let subscribed = [];

	ws.onmessage = async function(message) {

		let json;

		if(typeof message.data === 'string') {

			json = JSON.parse(message.data);

		} else {

			const len = new Uint32Array(await message.data.slice(0, 4).arrayBuffer())[0];
			const meta = JSON.parse(await message.data.slice(4, 4 + len).text());
			const data = await message.data.slice(len + 4);
			
			json = {...meta, data};

		}

		for(const func of subscribed) func(json)

	}

	async function wsPacker(meta, data){
		if(data instanceof Blob || data instanceof ArrayBuffer) {
			const header = new TextEncoder('utf-8').encode(JSON.stringify(meta));
			return new Uint8Array([...new Uint8Array(Uint32Array.of(header.length).buffer), ...header, ...new Uint8Array(data)]);
		} else {
			return JSON.stringify({ ...meta, data: data || {} });
		}
	}

	function onEvent(event, callback) {
		async function handler(meta) {
			if(meta.event === event) ws.send(await wsPacker({event, complete: true, id: meta.id}, await callback(meta.data)));
		}
		subscribed.push(handler);
		return () => subscribed.filter(v => v !== handler);
	}

	async function emit(event, data) {

		const id = Math.random().toString(36).substring(2, 9);

		return await new Promise(async(resolve) => {
			function completeHandler(meta){
				if(meta.complete && meta.event === event && meta.id === id) {
					subscribed.filter(v => v !== completeHandler);
					resolve(meta.data);
				}
			}
			subscribed.push(completeHandler);
			ws.send(await wsPacker({ event, id }, data))
		})
	}

	function close() {
		emit('close', {});
		subscribed = [];
		ws.close();
	}

	return await new Promise(resolve => {
		ws.onopen = () => resolve({ onEvent, emit, close });
	});
}

export default websocket;