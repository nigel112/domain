import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],root:'apps/launch-web',server:{host:'0.0.0.0',port:5174,strictPort:true,allowedHosts:true,proxy:{'/api':process.env.LAUNCH_API_URL||'http://127.0.0.1:4001'}},build:{outDir:'../../launch-web-build',emptyOutDir:true}});
