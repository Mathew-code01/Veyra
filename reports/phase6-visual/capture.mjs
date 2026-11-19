import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results=[];
async function capture(url,width,height,name){
 const page=await browser.newPage({viewport:{width,height}}); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:5181${url}`,{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('h1').first().waitFor({timeout:15000}); await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(1800);
 const heightTotal=await page.evaluate(()=>document.documentElement.scrollHeight);
 for(let y=0;y<heightTotal;y+=Math.max(400,Math.round(height*.72))){ await page.evaluate(y=>window.scrollTo(0,y),y); await page.waitForTimeout(180); }
 await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(900);
 await page.screenshot({path:`C:/Users/MATTHEW/Desktop/Veyra/reports/phase6-visual/${name}.png`,fullPage:true});
 const layout=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,title:document.title,scrollHeight:document.documentElement.scrollHeight}));
 results.push({name,...layout,pageErrors:errors}); await page.close();
}
for(const [width,height] of [[1440,1000],[1280,900],[1024,900],[768,900],[390,844],[360,780]]) await capture('/',width,height,`website-home-${width}`);
for(const [route,name] of [['/login','website-login'],['/pricing','website-pricing']]) { await capture(route,1440,900,`${name}-1440`); await capture(route,390,844,`${name}-390`); }
await browser.close(); console.log(JSON.stringify(results,null,2));
