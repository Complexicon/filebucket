const express = require('express');
const path = require('path');
const useWS = require('./ws_middleware');

const { openSync, closeSync, writeSync } = require('fs');

const app = express();

app.use(require('morgan')('dev'));

const chunkSizeMin = 512;
const chunkSizeMax = 1024*1024*4;

app.get('/upload', useWS(async function(ws) {
	let fbuf;
	let fileHandle;
	let chunkSize;

	ws.onEvent('beginUpload', fileInfo => {
		chunkSize = Math.ceil(fileInfo.size / 100);
		if(chunkSize < chunkSizeMin) chunkSize = chunkSizeMin;
		if(chunkSize > chunkSizeMax) chunkSize = chunkSizeMax;

		console.log('upload request! filename:', fileInfo.initFileUpload, 'size:', fileInfo.size, 'determined chunk size:', chunkSize)

		const chunksTotal = Math.ceil(fileInfo.size / chunkSize);
		fileHandle = openSync(fileInfo.initFileUpload, 'w');
		fbuf = Array.from({length: chunksTotal}, () => null);

		return ({ chunkSize, id: 0 });
	});

	ws.onEvent('fileChunk', message => {
		const headerLen = message.readInt32LE();
		const header = JSON.parse(message.slice(4, headerLen + 4).toString('utf-8'));

		const body = message.slice(headerLen + 4);

		writeSync(fileHandle, body, 0, body.byteLength, header.chunk * chunkSize);

		fbuf[header.chunk] = true;

		if(fbuf.find(v => v === null) === undefined) {
			console.log('upload finished');
			closeSync(fileHandle);
			return { finished: true };
		}else{
			return { progress: header.chunk / (fbuf.length - 1) };
		}
	})
}));

app.use(express.static(path.resolve('public')));
app.get('*', (_, res) => res.sendFile(path.resolve('public', 'index.html')));

app.listen(3000, () => console.log('running @ http://localhost:3000/'));