import { chromium } from 'playwright';
const browser=await chromium.launch({channel:'msedge',headless:true}); const results=[];
for(const [route,name] of [['/login','website-login'],['/pricing','website-pricing']]) for(const [width,height] of [[1440,900],[390,844]]) {
 const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:5181${route}`,{waitUntil:'domcontentloaded',timeout:30000});await page.locator('body').waitFor({state:'visible'});await page.waitForTimeout(1200);
 await page.screenshot({path:`C:/Users/MATTHEW/Desktop/Veyra/reports/phase6-visual/${name}-${width}.png`,fullPage:true});
 results.push({name,width,documentWidth:await page.evaluate(()=>document.documentElement.scrollWidth),pageErrors:errors});await page.close();
}
await browser.close();console.log(JSON.stringify(results,null,2));
