import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Use system 'ffmpeg' if available (e.g. Render / Production environment),
// otherwise fall back to local @ffmpeg-installer binary.
let ffmpegPath = 'ffmpeg';

try {
    const check = spawn('ffmpeg', ['-version']);
    check.on('error', () => {
          ffmpegPath = ffmpegInstaller.path;
          console.log(`[Relay Server] System ffmpeg not found. Using local installer path: ${ffmpegPath}`);
    });
} catch (e) {
    ffmpegPath = ffmpegInstaller.path;
    console.log(`[Relay Server] Error checking system ffmpeg. Using local installer path: ${ffmpegPath}`);
}

const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Streaming Relay Server is running.');
});
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    console.log('Cliente conectado para streaming');

         // Extract query parameters for RTMP target
         const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const rtmpUrl = urlParams.get('rtmpUrl');
    const streamKey = urlParams.get('streamKey');

         if (!rtmpUrl || !streamKey) {
               console.error('Faltan parametros de conexion rtmpUrl o streamKey');
               ws.close(4000, 'Faltan parametros de conexion rtmpUrl o streamKey');
               return;
         }

         const destination = `${rtmpUrl}${streamKey}`;
    console.log(`Iniciando ffmpeg hacia destino RTMP: ${destination}`);

         // Spawn FFmpeg process
         // Input: stdin (WebM stream containing H.264/VP8/VP9 video and Opus/AAC audio)
         // Output: RTMPS (H.264 video, AAC audio, FLV format)
         const ffmpeg = spawn(ffmpegPath, [
               '-i', '-', // Read input from standard input
               '-c:v', 'libx264', // Transcode video to H.264
               '-preset', 'veryfast', // Fast compression preset
               '-tune', 'zerolatency', // Minimize latency for streaming
               '-pix_fmt', 'yuv420p', // Standard pixel format for web video player compatibility
               '-g', '60', // Keyframe interval (2 seconds at 30 fps)
               '-c:a', 'aac', // Transcode audio to AAC
               '-b:a', '128k', // Audio bitrate
               '-ar', '44100', // Audio sample rate
               '-f', 'flv', // Output format FLV (required by RTMP)
               destination // Target RTMP URL
             ]);

         ffmpeg.stdout.on('data', (data) => {
               console.log(`ffmpeg stdout: ${data}`);
         });

         ffmpeg.stderr.on('data', (data) => {
               console.log(`ffmpeg: ${data}`);
         });

         ffmpeg.on('close', (code) => {
               console.log(`ffmpeg cerrado con codigo: ${code}`);
               ws.close();
         });

         ws.on('message', (message) => {
               if (ffmpeg.stdin.writable) {
                       ffmpeg.stdin.write(message);
               }
         });

         ws.on('close', () => {
               console.log('Cliente desconectado del socket');
               if (ffmpeg) {
                       ffmpeg.stdin.end();
                       ffmpeg.kill('SIGINT');
               }
         });

         ws.on('error', (err) => {
               console.error('Error en WebSocket:', err);
               if (ffmpeg) {
                       ffmpeg.stdin.end();
                       ffmpeg.kill('SIGINT');
               }
         });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log(`[Streaming Server] Servidor RTMP Relay escuchando en el puerto ${PORT}`);
});
