import { render } from "react-dom";
import { useEffect, useState, useRef } from 'react';
import websocket from './websocket';

const preventer = (cb) => (e) => { e.preventDefault(); e.stopPropagation(); cb && cb(e) };
const sizeBytes = (bytes, decimals = 2) => (bytes === 0) ? '0 Bytes' : parseFloat((bytes / Math.pow(1024, Math.floor(Math.log(bytes) / Math.log(1024)))).toFixed(decimals < 0 ? 0 : decimals)) + ' ' + ['Bytes', 'KB', 'MB', 'GB'][Math.floor(Math.log(bytes) / Math.log(1024))];

function readChunked(f, chunkSize, onChunk) {

	var offset = 0;
	var chunkID = 0;

	async function chunkReader() {
		const reader = new FileReader();
		reader.onload = async (e) => {
			if (e.target.error == null && offset < f.size) {
				offset += e.target.result.byteLength;
				await onChunk({ chunkID, offset, 'data': e.target.result });
				await chunkReader();
				chunkID++;
			}
		}
		reader.readAsArrayBuffer(f.slice(offset, offset + chunkSize))
	}

	chunkReader();

}

async function merge(json, arraybuffer) {
	const header = new TextEncoder('utf-8').encode(JSON.stringify(json));
	return new Uint8Array([...new Uint8Array(Uint32Array.of(header.length).buffer), ...header, ...new Uint8Array(arraybuffer)]);
}

function FileDescriptor({ children }) {
	return (
		<div className="whitespace-pre p-1 elevated">
			<i className="fas fa-file fa-lg m-1 mx-2" />
			{children?.name} ({sizeBytes(children?.size)})
		</div>
	)
}

function Dropzone({ onFileSelected }) {

	const [file, setFile] = useState(null);
	const inputRef = useRef(null);

	const placeholder = <span className="mx-2"><i className="fas fa-upload fa-lg m-1 mx-2" />Drop files Here...</span>;

	return (
		<>
			<div className="my-2 border-dashed p-5 border-2 clickable d-flex flex-column align-items-center justify-content-center" onClick={() => inputRef.current.click()} draggable onDrop={preventer(e => setFile(e.dataTransfer.files[0]))} onDragOver={preventer(e => e.dataTransfer.dropEffect = 'copy')}>
				<input type="file" hidden onChange={e => setFile(e.target.files[0])} ref={inputRef} />
				{file ? <FileDescriptor>{file}</FileDescriptor> : placeholder}
			</div>
			{file && <button className="btn btn-primary mt-2 w-100 btn-lg" onClick={preventer(() => onFileSelected && onFileSelected(file))}>Upload!</button>}
		</>
	)
}

function Progress({ file, children }) {
	return (
		<div className="my-2 border border-info rounded-3 d-flex flex-column align-items-center justify-content-center position-relative elevated">
			<FileDescriptor>{file}</FileDescriptor>
			<div className="progress-bar rounded-start progress-bar-animated h-100 position-absolute bg-info" style={{width: parseInt(children) + '%', left: 0}} />
		</div>
	)
}

function Fileupload() {

	const [file, setFile] = useState(null);
	const [throughput, updateThroughput] = useState(sizeBytes(0));
	const [progress, setProgress] = useState(0);

	function onFinish() {
		console.log('finished');
	}

	async function initiateUpload(file){
		setFile(file);
		const ws = await websocket('/upload');
		const config = await ws.emit('beginUpload', { initFileUpload: file.name, size: file.size });

		let metrics = [];

		const interval = setInterval(() => {
			const perSec = metrics.reduce((p, c) => p + c, 0) / metrics.length;
			metrics = [];
			updateThroughput(sizeBytes(perSec));
		}, 1000);

		readChunked(file, config.chunkSize, async (info) => {
			const begin = performance.now();
			const result = await ws.emit('fileChunk', (await merge({ chunk: info.chunkID }, info.data)).buffer);
			const time = performance.now() - begin;

			metrics.push((1000 / time) * config.chunkSize);

			if (result.progress) {
				const newProgress = Math.round(result.progress * 100);
				if (newProgress !== progress) setProgress(newProgress);
			} else if (result.finished) {
				setProgress(100);
				clearInterval(interval);
				ws.close();
                onFinish();
			}
		});

	}

	return (
		<>
			{file ? <Progress file={file}>{progress}</Progress> : <Dropzone onFileSelected={initiateUpload} />}		
		</>

	)
}

function App() {

	return (
		<div className="h-100 d-flex flex-column">
			<header className="text-white">
				<h1 className="px-4 pt-4">Simple File Upload</h1>
			</header>
			<div className="h-100 d-flex align-items-center">
				<div className="modal-dialog w-100">
					<div className="modal-content rounded-6 shadow border-0">
						<div className="modal-body p-5">
							<h2 className="fw-bold mb-0">Upload Files Here</h2>
							<Fileupload />
						</div>
					</div>
				</div>
			</div>
			<footer className="d-flex flex-wrap justify-content-between align-items-center p-3">
				<div className="col-md-4 d-flex align-items-center">
					<a href="/" className="mb-3 me-2 mb-md-0 text-white text-decoration-none lh-1">
						[logo placeholder]
					</a>
					<span className="text-white">by cmplx</span>
				</div>

				<ul className="nav col-md-4 justify-content-end list-unstyled d-flex">
					<li className="ms-3"><a className="text-white" href="#"><i className="fab fa-twitter fa-lg"></i></a></li>
					<li className="ms-3"><a className="text-white" href="#"><i className="fab fa-instagram fa-lg"></i></a></li>
					<li className="ms-3"><a className="text-white" href="#"><i className="fab fa-github fa-lg"></i></a></li>
				</ul>
			</footer>
		</div>
	)
}

render(<App />, document.getElementById('app'));