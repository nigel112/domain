import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],root:'apps/web',server:{host:'0.0.0.0',allowedHosts:true,proxy:{'/api':'http://127.0.0.1:4000','/socket.io':{target:'http://127.0.0.1:4000',ws:true}}},build:{outDir:'../../web-build',emptyOutDir:true}});
