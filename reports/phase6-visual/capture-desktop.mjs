import path from 'node:path';
import { _electron as electron } from 'playwright';
const root='C:/Users/MATTHEW/Desktop/Veyra';
const env={...process.env,NODE_ENV:'development',ELECTRON_OVERRIDE_DIST_PATH:path.join(root,'desktop/node_modules/electron/dist')}; delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.join(root,'desktop/node_modules/electron/dist/electron.exe'),args:['.'],cwd:root,env});
const page=await app.firstWindow();
page.on('pageerror',e=>console.error('pageerror:',e.message));
await page.waitForLoadState('domcontentloaded',{timeout:60000});
await page.getByText('First-time setup').waitFor({timeout:30000});
await page.waitForTimeout(1000);
const results=[];
async function resize(width,height){
 await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(size.width,size.height),{width,height});
 await page.waitForTimeout(500);
 const layout=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,height:innerHeight}));
 return layout;
}
for(const [width,height] of [[1440,1000],[1280,900],[1024,900],[768,900],[390,844],[360,780]]){
 const layout=await resize(width,height);
 await page.screenshot({path:`${root}/reports/phase6-visual/desktop-onboarding-${width}.png`,fullPage:true});
 results.push({screen:'onboarding',width,...layout});
}
await page.emulateMedia({reducedMotion:'reduce'}); await page.screenshot({path:`${root}/reports/phase6-visual/desktop-onboarding-reduced-motion.png`,fullPage:true});
await page.emulateMedia({reducedMotion:'no-preference'});
for(const [width,height] of [[1440,1000],[1280,900],[1024,900],[768,900],[390,844],[360,780]]){
 await resize(width,height);
 await page.goto('http://127.0.0.1:5174/assessments',{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('h1').first().waitFor({timeout:20000}); await page.waitForTimeout(700);
 const layout=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,height:innerHeight}));
 await page.screenshot({path:`${root}/reports/phase6-visual/desktop-assessments-${width}.png`,fullPage:true});
 results.push({screen:'assessments',width,...layout});
}
await resize(1440,1000); await page.goto('http://127.0.0.1:5174/account',{waitUntil:'domcontentloaded',timeout:30000}); await page.waitForTimeout(1000); await page.screenshot({path:`${root}/reports/phase6-visual/desktop-account-1440.png`,fullPage:true});
await page.goto('http://127.0.0.1:5174/settings',{waitUntil:'domcontentloaded',timeout:30000}); await page.waitForTimeout(1000); await page.screenshot({path:`${root}/reports/phase6-visual/desktop-settings-1440.png`,fullPage:true});
await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].maximize()); await page.waitForTimeout(500); await page.screenshot({path:`${root}/reports/phase6-visual/desktop-maximized.png`,fullPage:true});
await page.keyboard.press('Tab'); console.log(JSON.stringify({results,keyboardFocus:await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')}))},null,2));
await app.close();


