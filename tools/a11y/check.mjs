import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const pages=process.argv.slice(2);
await mkdir('a11y-results',{recursive:true});
const browser=await chromium.launch(); let failed=false; const summary=[];
try {
 for(const pathname of pages){
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(`http://127.0.0.1:8765/${pathname.replace(/^docs\//,'')}`);if(!response?.ok())throw Error(`Preview failed to load ${pathname}: ${response?.status()}`);await page.locator('#main').waitFor();await page.waitForTimeout(1500);
  if(pathname.includes('Keyword')){await page.locator('iframe.defaults-check').scrollIntoViewIfNeeded();await page.frameLocator('iframe.defaults-check').locator('.h5p-content').waitFor();}
  const states=[['initial',async()=>{}]];
  if(pathname.includes('11A_'))states.push(['annotated',async()=>{
   await page.getByText('Offline comparison',{exact:true}).click();await page.getByRole('button',{name:'Load practice examples',exact:true}).click();
   await page.locator('#quote').fill('You could');await page.locator('#interpretation').fill('A hedged suggestion invites rather than commands.');
   await page.getByRole('button',{name:'Add annotation',exact:true}).click();
   if(await page.locator('#annotations li').count()!==1)throw Error('Annotation was not added.');
  }]);
  if(pathname.includes('11B_'))states.push(['sentence',async()=>{
   await page.getByRole('button',{name:'Generate a whole sentence',exact:true}).click();
   if(await page.locator('#generate').isDisabled())throw Error('Part 2 was not unlocked.');
   await page.locator('#corpus').fill('new words');
   if(!await page.locator('#generate').isDisabled())throw Error('Corpus edit did not relock part 2.');
   if((await page.locator('#sentence-output').innerText())!=='Sentence not started.')throw Error('Stale sentence remained.');
   await page.getByRole('button',{name:'Build bigram model',exact:true}).click();
   await page.getByRole('button',{name:'Generate a whole sentence',exact:true}).click();
  }]);
  if(pathname.includes('Keyword'))states.push(['second-call',async()=>{
   await page.locator('#step').click();await page.locator('#step').click();
   if(await page.locator('#calls li').count()<2)throw Error('Two calls were not shown.');
  }]);
  if(pathname.includes('Text_Files'))states.push(['complete',async()=>{await page.locator('#run').click();}]);
  for(const [state,prepare] of states){
   await prepare(); const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
   const name=pathname.split('/').pop().replace('.html','')+'-'+state;
   await writeFile(`a11y-results/${name}.json`,JSON.stringify(result,null,2));
   await page.screenshot({path:`a11y-results/${name}.png`,fullPage:true});
   summary.push({page:pathname,state,violations:result.violations,manualReview:result.incomplete.map(x=>({id:x.id,description:x.description})),errors});
   if(result.violations.length||errors.length)failed=true;
  }
  await page.setViewportSize({width:390,height:844});
  const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
  if(sizes.scroll>sizes.viewport+1){failed=true;summary.push({page:pathname,error:'Page overflows at 390px',sizes});}
  await page.screenshot({path:`a11y-results/${pathname.split('/').pop()}-mobile.png`,fullPage:true});
  await context.close();
 }
} finally {await browser.close();}
await writeFile('a11y-results/summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary.map(({page,state,violations,errors,error})=>({page,state,violations:violations?.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),errors,error})),null,2));
if(failed)process.exitCode=1;
