import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./tests/maps-e2e',timeout:30000,use:{baseURL:'http://127.0.0.1:5174',trace:'off'},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],webServer:{command:'npm run dev:maps',url:'http://127.0.0.1:5174',reuseExistingServer:true},reporter:'list'});
