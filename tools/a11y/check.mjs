import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const pages=process.argv.slice(2);
await mkdir('a11y-results',{recursive:true});
const browser=await chromium.launch(); let failed=false; const summary=[];
try {
 for(const pathname of pages){
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(`https://uga-ling2150.github.io/applets/${pathname.replace(/^docs\//,'')}`);if(!response?.ok())throw Error(`Preview failed to load ${pathname}: ${response?.status()}`);await page.locator('#main').waitFor();await page.waitForTimeout(1500);
  if(pathname.includes('Keyword')){await page.locator('iframe.defaults-check').scrollIntoViewIfNeeded();await page.frameLocator('iframe.defaults-check').locator('.h5p-content').waitFor();}
  const states=[['initial',async()=>{
   if(pathname.includes('11B_')){
    if(!await page.locator('#many').isVisible())throw Error('The first generation action is hidden.');
    for(const id of ['corpus','sample','clear','temperature','topk','live-activity','inspection-area'])if(await page.locator('#'+id).isVisible())throw Error('Too many controls shown before the first sentence: '+id);
   }
  }]];
  if(pathname.includes('11A_'))states.push(['annotation-controls',async()=>{
   if(await page.locator('.lesson-container ol li').count()!==3)throw Error('11A introduction must retain three clear steps.');
   if(!(await page.locator('.lesson-container').innerText()).includes('Use exact phrases to support your interpretation.'))throw Error('11A intro lost its language-evidence guidance.');
   const subtitle=await page.locator('.hero-text p').evaluate(n=>({height:n.getBoundingClientRect().height,line:parseFloat(getComputedStyle(n).lineHeight)}));
   if(subtitle.height>subtitle.line+1)throw Error('Short subtitle wraps early on desktop.');
   if(!await page.locator('#save-pair').isDisabled())throw Error('Keep comparison should require an answer.');
   if(!await page.locator('#save-panel #save-pair').count())throw Error('Snapshot button is not in saving step.');
   if(!await page.locator('.app-wrapper details').filter({has:page.locator('#example')}).count())throw Error('Offline practice is not in the activity.');
   const order=await page.evaluate(()=>['example','log-a','evidence-panel','annotation-panel','save-pair'].map(id=>Array.from(document.querySelectorAll('*')).indexOf(document.getElementById(id))));
   if(order.some((n,i)=>i&&n<=order[i-1]))throw Error('Offline entry, evidence or saving controls break the teaching sequence.');
   await page.getByText('Offline comparison',{exact:true}).click();await page.getByRole('button',{name:'Load practice examples',exact:true}).click();
   if(!await page.getByText('Worked example: from phrase to annotation',{exact:true}).isVisible())throw Error('Worked example is missing.');
   if(!(await page.locator('#selected-phrase').innerText()).includes('No phrase selected'))throw Error('Empty selection guidance missing.');
  }],['native-selection-feature',async()=>{
   const output=page.locator('#log-a .chat-turn__text');await output.scrollIntoViewIfNeeded();
   const box=await output.evaluate(n=>{const text=n.querySelector('span').firstChild;const range=document.createRange();range.setStart(text,0);range.setEnd(text,12);const r=range.getClientRects()[0];return {x:r.x,y:r.y,width:r.width,height:r.height};});
   await page.mouse.move(box.x+1,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width-1,box.y+box.height/2,{steps:8});await page.mouse.up();
   await page.waitForFunction(()=>document.getElementById('quote').value.trim().length>0);
   await page.locator('#category').focus();
   if(!await page.locator('#log-a .current-phrase').count())throw Error('First focus on Feature did not highlight the current phrase green.');
   for(const [value,word] of [['address','relationship'],['certainty','strongly'],['register','formal'],['evaluation','feelings'],['politeness','request'],['other','language feature']]){
    await page.locator('#category').selectOption(value);
    if(!(await page.locator('#feature-help').innerText()).toLowerCase().includes(word))throw Error('Missing feature definition: '+value);
   }
   if(!await page.locator('#quote').isVisible())await page.locator('#quote-entry summary').click();
   await page.locator('#quote').fill('');
  }],['invalid-quote',async()=>{
   await page.getByRole('button',{name:'Add annotation',exact:true}).click();
   if(!(await page.locator('#annotation-error').innerText()).includes('Select a phrase'))throw Error('Error was not placed beside the annotation form.');
   if(!await page.locator('#quote-entry').getAttribute('open') && !await page.locator('#quote').isVisible())throw Error('Keyboard quote fallback was not opened.');
   await page.locator('#quote').fill('not present in this answer');
   if(!(await page.locator('#selected-phrase').innerText()).includes('does not match'))throw Error('Invalid quote feedback missing.');
  }],['annotated',async()=>{
   await page.locator('#quote').fill('You could');
   await page.locator('#category').selectOption('certainty');
   await page.locator('#interpretation').fill('Could offers a suggestion instead of a command, supporting a careful tutor persona.');
   if(!(await page.locator('#selected-phrase').innerText()).includes('Persona A: “You could”'))throw Error('Selected quote and output were not shown.');
   await page.getByRole('button',{name:'Add annotation',exact:true}).click();
   if(await page.locator('#annotations li').count()!==1)throw Error('Annotation was not added.');
   if(!await page.locator('#evidence-empty').isHidden())throw Error('Empty evidence message remained.');
  }],['both-answers-and-snapshot',async()=>{
   await page.locator('#side').selectOption('b');await page.locator('#quote').fill('Let’s tackle');
   await page.locator('#category').selectOption('evaluation');
   await page.locator('#interpretation').fill('Let’s suggests a collaborative peer relationship; the exclamation conveys enthusiasm.');
   await page.locator('#annotate').click();await page.locator('#save-pair').click();
   if(await page.locator('#annotations li').count()!==2)throw Error('Both outputs were not annotated.');
   if(await page.locator('#history details').count()!==1)throw Error('Snapshot missing.');
   await page.locator('#history summary').click();
   if(!(await page.locator('#history').innerText()).includes('Certainty and hedging')||!(await page.locator('#history').innerText()).includes('Evaluation and affect'))throw Error('Saved history omitted feature categories.');
   await page.locator('#system-a').fill('You are a concise tutor.');
   const [file]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);
   const data=JSON.parse(await readFile(await file.path(),'utf8'));
   if(data.comparisons.length!==1||data.comparisons[0].annotations.length!==2)throw Error('Comparison export omitted annotations or duplicated snapshot.');
   if(!data.comparisons[0].systems.a.includes('Authored'))throw Error('Export replaced source prompts with ungenerated edits.');
   await page.locator('#reflection').fill('Could sounds cautious, while Let’s sounds collaborative.');
   const [notes]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download reflection notes',exact:true}).click()]);
   if(!(await readFile(await notes.path(),'utf8')).includes('Could sounds cautious'))throw Error('Reflection export lost notes.');
  }],['annotation-removed',async()=>{
   await page.getByRole('button',{name:'Remove annotation 1 for Persona A',exact:true}).click();
   if(await page.locator('#annotations li').count()!==1)throw Error('Annotation was not removed.');
   if(!await page.locator('#annotate').evaluate(n=>n===document.activeElement))throw Error('Deletion lost keyboard focus.');
   const [file]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);
   const data=JSON.parse(await readFile(await file.path(),'utf8'));
   if(data.comparisons[0].annotations.length!==1)throw Error('Download retained deleted evidence.');
  }],['previous-comparison-kept',async()=>{
   await page.getByRole('button',{name:'Load practice examples',exact:true}).click();
   if(await page.locator('#annotations li').count()!==0||await page.locator('#history details').count()!==1)throw Error('New comparison lost history or retained old active annotations.');
   const [file]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);
   const data=JSON.parse(await readFile(await file.path(),'utf8'));
   if(data.comparisons.length!==2||data.comparisons[0].annotations.length!==1||data.comparisons[1].annotations.length!==0)throw Error('Export mixed comparisons.');
  }],['scrollable-evidence',async()=>{
   if(!await page.locator('#quote').isVisible())await page.locator('#quote-entry summary').click();
   for(let n=0;n<8;n++){
    await page.locator('#side').selectOption('a');await page.locator('#quote').fill('You could');
    await page.locator('#interpretation').fill('Could frames this advice as a cautious suggestion rather than a command, which supports a careful tutor interpretation.');
    await page.locator('#annotate').click();
   }
   const dims=await page.locator('#annotations').evaluate(n=>({height:n.clientHeight,scroll:n.scrollHeight}));
   if(dims.scroll<=dims.height||dims.height>300)throw Error('Evidence list is not constrained to a compact scrollable box.');
   if(!await page.locator('#log-a mark:not(.current-phrase)').count())throw Error('Saved evidence is not highlighted.');
  }]);
  if(pathname.includes('11B_'))states.push(['sentence',async()=>{
   if(await page.locator('.lesson-container ol li').count()!==3)throw Error('11B introduction must provide three short steps.');
   if(await page.locator('.lesson-container dl').count())throw Error('Repeated glossary returned to the 11B introduction.');
   if(await page.locator('.term-help').count()<5)throw Error('Contextual term definitions were removed.');
   await page.locator('#training-options summary').click();
   if(!(await page.locator('#corpus-help').innerText()).includes('repeated sentences count again'))throw Error('Training examples lack a purpose explanation.');
   if(!(await page.locator('#corpus-example').innerText()).includes('37.5%'))throw Error('Default count-to-probability example is missing.');
   const counts=await page.locator('#corpus').inputValue();const studyPairs=counts.trim().split('\n').map(s=>s.trim().split(/\s+/)).filter(ws=>ws[1]==='study');
   if(studyPairs.length!==8||studyPairs.filter(ws=>ws[2]==='language').length!==3)throw Error('Default example no longer matches training data.');
   if((await page.locator('#corpus').getAttribute('aria-describedby'))!=='corpus-help corpus-example corpus-actions')throw Error('Training guidance is not associated with its input.');

   await page.locator('#training-options summary').click();
   const subtitle=await page.locator('.hero-text p').evaluate(n=>({height:n.getBoundingClientRect().height,line:parseFloat(getComputedStyle(n).lineHeight)}));
   if(subtitle.height>subtitle.line+1)throw Error('11B subtitle wraps prematurely on desktop.');
   await page.getByRole('button',{name:'Generate a whole sentence',exact:true}).click();
   if(!await page.locator('#inspection-area').isVisible()||!await page.locator('#temperature').isVisible())throw Error('Inspection and temperature were not revealed after generation.');
   if(await page.locator('#context').isVisible()||(await page.locator('#context-view').innerText())!=='study')throw Error('Context should be read-only text for the chosen step.');
   for(const id of ['topk','nucleus','topp','sample','clear'])if(!await page.locator('#'+id).isVisible())throw Error('Routine controls require unnecessary expansion: '+id);
   await page.locator('#training-options summary').click();
   if(await page.locator('#generate').isDisabled())throw Error('Part 2 was not unlocked.');
   await page.locator('#corpus').fill('we study language\nwe study language\nwe study language\nwe study speech');
   if(!await page.locator('#generate').isDisabled())throw Error('Corpus edit did not relock part 2.');
   if((await page.locator('#sentence-output').innerText())!=='Sentence not started.')throw Error('Stale sentence remained.');
   await page.getByRole('button',{name:'Build bigram model',exact:true}).click();
   await page.getByRole('button',{name:'Generate a whole sentence',exact:true}).click();
  }]);
  if(pathname.includes('11B_'))states.push(['same-step-comparison',async()=>{
   const before=await page.evaluate(()=>({context:document.getElementById('context').value,step:document.getElementById('inspect-step').value,sentence:document.getElementById('sentence-output').textContent,base:Array.from(document.querySelectorAll('#distribution tr')).map(n=>n.children[2].textContent),final:Array.from(document.querySelectorAll('#distribution tr')).map(n=>n.children[5].textContent)}));
   await page.locator('#temperature').fill('0.5');
   const after=await page.evaluate(()=>({context:document.getElementById('context').value,step:document.getElementById('inspect-step').value,sentence:document.getElementById('sentence-output').textContent,base:Array.from(document.querySelectorAll('#distribution tr')).map(n=>n.children[2].textContent),final:Array.from(document.querySelectorAll('#distribution tr')).map(n=>n.children[5].textContent)}));
   if(before.context!==after.context||before.step!==after.step||before.sentence!==after.sentence)throw Error('Parameter edit changed the saved step or sentence.');
   if(JSON.stringify(before.base)!==JSON.stringify(after.base))throw Error('Parameter edit replaced the comparison baseline.');
   if(JSON.stringify(before.final)===JSON.stringify(after.final))throw Error('Changing temperature did not update the probabilities.');
  }],['repeated-observations',async()=>{
   const total=()=>page.locator('#distribution tr').evaluateAll(nodes=>nodes.reduce((sum,n)=>sum+Number(n.children[6].textContent),0));
   if(await total()!==0)throw Error('Old-condition counts leaked into the new controls.');
   await page.getByRole('button',{name:'Generate a whole sentence',exact:true}).click();
   await page.getByRole('button',{name:'Generate a whole sentence',exact:true}).click();
   if(await total()!==2)throw Error('Repeated sentence visits did not accumulate two actual observations.');
   await page.locator('#temperature').fill('1');
   if(await total()!==0)throw Error('Counts from different parameter settings were mixed.');
   const [download]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.locator('#download').click()]);
   const exported=JSON.parse(await readFile(await download.path(),'utf8'));
   const saved=exported.sentenceTrace[2];
   if(exported.context!=='study'||exported.settings.temperature!==1||exported.total!==0)throw Error('Export did not describe the current comparison condition.');
   if(saved.settings.temperature!==0.5||saved.rows[0].prob===exported.distribution[0].prob)throw Error('Export rewrote the original sampled step with the preview condition.');
  }]);
  if(pathname.includes('11B_'))states.push(['top-k-cutoff',async()=>{
   await page.locator('#topk').fill('1');
   const probs=await page.locator('#distribution tr').evaluateAll(ns=>ns.map(n=>Number(n.children[5].textContent.replace('%',''))));
   if(probs[0]!==100||probs.slice(1).some(n=>n!==0))throw Error('Top-k=1 failed to exclude lower candidates.');
   if(!(await page.locator('#probability-charts').innerText()).includes('Top-k cutoff'))throw Error('Top-k cutoff line lacks its label.');
  }],['nucleus-and-greedy',async()=>{
   await page.locator('#topk').fill('0');await page.locator('#topp').fill('0.7');
   const before=await page.locator('#distribution').innerText();
   await page.locator('#nucleus').selectOption('topq');
   if(await page.locator('#distribution').innerText()!==before)throw Error('Equivalent top-q notation changed the distribution.');
   await page.locator('#temperature').fill('0');
   const probs=await page.locator('#distribution tr').evaluateAll(ns=>ns.map(n=>Number(n.children[5].textContent.replace('%',''))));
   if(probs[0]!==100||probs.slice(1).some(n=>n!==0))throw Error('Greedy temperature failed.');
  }],['invalid-recovery',async()=>{
   const sentence=await page.locator('#sentence-output').innerText();
   await page.locator('#temperature').fill('-1');
   if(!await page.locator('#sample').isDisabled()||!await page.locator('#probability-panel').isHidden())throw Error('Invalid settings retained a usable stale distribution.');
   if(await page.locator('#sentence-output').innerText()!==sentence)throw Error('Invalid settings erased the saved sentence.');
   await page.locator('#temperature').fill('1');
   if(await page.locator('#sample').isDisabled()||!await page.locator('#probability-panel').isVisible())throw Error('Valid settings did not recover.');
  }],['corpus-rebuild',async()=>{
   await page.locator('#corpus').fill('we study words\nwe study sounds');
   if(!await page.locator('#generate').isDisabled()||!await page.locator('#sample').isDisabled())throw Error('Corpus edit failed to relock stale activities.');
   await page.locator('#train').click();await page.locator('#many').click();
   if(await page.locator('#generate').isDisabled())throw Error('Rebuilt model could not unlock part 2.');
  }],['optional-step-and-recovery',async()=>{
   await page.locator('#clear').click();
   if(!await page.locator('#inspection-area').isHidden())throw Error('Restart did not return to the first step.');
   await page.locator('#sample').click();
   if(!await page.locator('#inspection-area').isVisible())throw Error('Optional word stepping did not reveal inspection.');
   await page.locator('#temperature').fill('-1');
   await page.locator('#train').click();
   if(!await page.locator('#temperature').isVisible())throw Error('Invalid controls were hidden during rebuilding, blocking recovery.');
   await page.locator('#temperature').fill('1');await page.locator('#many').click();
   if(await page.locator('#generate').isDisabled())throw Error('Recovered model could not finish a sentence.');
  }]);
  if(pathname.includes('Keyword'))states.push(['second-call',async()=>{
   await page.locator('#step').click();await page.locator('#step').click();
   if(await page.locator('#calls li').count()<2)throw Error('Two calls were not shown.');
  }]);
  if(pathname.includes('Text_Files'))states.push(['complete',async()=>{await page.locator('#run').click();}],['EOF',async()=>{
   await page.locator('#n').fill('8');await page.locator('#prepare').click();await page.locator('#run').click();
   if(!(await page.locator('#variables').innerText()).includes('File: closed.'))throw Error('Run to end did not close the file after EOF.');
   if(!(await page.locator('#error').innerText()).includes('StopIteration'))throw Error('EOF evidence was lost.');
  }]);
  if(pathname.includes('Keyword')){
   states.push(['practice-feedback',async()=>{
    const practice=page.frameLocator('iframe.defaults-check');
    await practice.getByRole('radio',{name:/Both cat and dog/}).click();
    await practice.getByRole('button',{name:/Check the answers/}).click();
   }]);
   for(let chapter=2;chapter<=4;chapter++)states.push([`practice-page-${chapter}`,async()=>{
    await page.frameLocator('iframe.defaults-check').getByRole('button',{name:'Next page',exact:true}).first().click();
    await page.waitForTimeout(500);
   }]);
  }
  for(const [state,prepare] of states){
   await prepare(); const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
   const name=pathname.split('/').pop().replace('.html','')+'-'+state;
   await writeFile(`a11y-results/${name}.json`,JSON.stringify(result,null,2));
   await page.screenshot({path:`a11y-results/${name}.png`,fullPage:true});
   summary.push({page:pathname,state,violations:result.violations,manualReview:result.incomplete.map(x=>({id:x.id,description:x.description})),errors});
   if(result.violations.length||errors.length)failed=true;
  }
  await page.getByRole('link',{name:'Skip to activity',exact:true}).focus();await page.keyboard.press('Enter');
  if(!await page.locator('#main').evaluate(n=>n===document.activeElement)){failed=true;summary.push({page:pathname,error:'Skip link did not focus main'});}
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
   if(sizes.scroll>sizes.viewport+1){failed=true;summary.push({page:pathname,error:`Page overflows at ${width}px`,sizes});}
   if(pathname.includes('11A_')||pathname.includes('11B_')){
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    await writeFile(`a11y-results/${pathname.includes('11B_')?'11B':'11A'}-mobile-${width}.json`,JSON.stringify(result,null,2));
    summary.push({page:pathname,state:`mobile-${width}`,violations:result.violations,manualReview:result.incomplete.map(x=>({id:x.id,description:x.description})),errors});
    if(result.violations.length||errors.length)failed=true;
   }
   await page.screenshot({path:`a11y-results/${pathname.split('/').pop()}-${width}px.png`,fullPage:true});
  }
  await context.close();
 }
} finally {await browser.close();}
await writeFile('a11y-results/summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary.map(({page,state,violations,errors,error})=>({page,state,violations:violations?.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),errors,error})),null,2));
if(failed)process.exitCode=1;
