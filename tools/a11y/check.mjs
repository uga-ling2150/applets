import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const pages=process.argv.slice(2);
await mkdir('a11y-results',{recursive:true});
const browser=await chromium.launch(); let failed=false; const summary=[];
try {
 for(const pathname of pages){
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(`http://127.0.0.1:8765/${pathname.replace(/^docs\//,'')}`);if(!response?.ok())throw Error(`Preview failed to load ${pathname}: ${response?.status()}`);await page.locator('#main').waitFor();await page.waitForTimeout(1500);
  if(pathname.includes('Keyword')){await page.locator('iframe.defaults-check').scrollIntoViewIfNeeded();await page.frameLocator('iframe.defaults-check').locator('.h5p-content').waitFor();}
  const states=[['initial',async()=>{
   if(pathname.includes('11A_')||pathname.includes('11B_')){
    for(const id of ['stage2-lock','stage3-lock'])if(!await page.locator('#'+id).isVisible())throw Error('Locked stage is not shown as locked: '+id);
    if(await page.locator('.rack > .stage').count()!==3)throw Error('Week 11 activity must use a three-stage rack.');
    if(await page.locator('.lesson-container ol li').count()!==3)throw Error('Introduction must keep three steps matching the rack.');
    const subtitle=await page.locator('.hero-text p').evaluate(n=>({height:n.getBoundingClientRect().height,line:parseFloat(getComputedStyle(n).lineHeight)}));
    if(subtitle.height>subtitle.line+1)throw Error('Short subtitle wraps early on desktop.');
   }
   if(pathname.includes('11B_')){
    if(!await page.locator('#many').isVisible())throw Error('The first generation action is hidden.');
    for(const id of ['corpus','sample','clear','temperature','topk','generate','inspection-area'])if(await page.locator('#'+id).isVisible())throw Error('Too many controls shown before the first sentence: '+id);
   }
   if(pathname.includes('11A_')){
    if(await page.locator('#save-pair').isVisible()||await page.locator('#log-a').isVisible())throw Error('Later steps are open before any answers exist.');
    if(!(await page.locator('.lesson-container').innerText()).includes('Use exact phrases to support your interpretation.'))throw Error('11A intro lost its language-evidence guidance.');
   }
  }]];
  if(pathname.includes('11A_'))states.push(['practice-loaded',async()=>{
   await page.getByRole('button',{name:'Use practice answers',exact:true}).click();
   if(!await page.locator('#stage2-content').isVisible()||!await page.locator('#stage3-content').isVisible())throw Error('Practice answers did not unlock steps 2 and 3.');
   for(const side of ['a','b'])if((await page.locator(`#annotations-${side} .evidence-empty`).count())!==1)throw Error('Empty evidence message missing for '+side);
  }],['native-selection-popup',async()=>{
   const output=page.locator('#log-a .chat-turn__text');await output.scrollIntoViewIfNeeded();
   const box=await output.evaluate(n=>{const text=n.querySelector('span').firstChild;const range=document.createRange();range.setStart(text,0);range.setEnd(text,12);const r=range.getClientRects()[0];return {x:r.x,y:r.y,width:r.width,height:r.height};});
   await page.mouse.move(box.x+1,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width-1,box.y+box.height/2,{steps:8});await page.mouse.up();
   await page.locator('#annotation-dialog[open]').waitFor();
   if(!(await page.locator('#quote').inputValue()).trim())throw Error('Popup did not receive the selected phrase.');
   if((await page.locator('#dialog-title').innerText())!=='Annotate Persona A')throw Error('Popup does not name the answer being annotated.');
   if(!await page.locator('#log-a .current-phrase').count())throw Error('Selected phrase is not highlighted green.');
   for(const [value,word] of [['address','relationship'],['certainty','strongly'],['register','formal'],['evaluation','feelings'],['politeness','request'],['other','language feature']]){
    await page.locator('#category').selectOption(value);
    if(!(await page.locator('#feature-help').innerText()).toLowerCase().includes(word))throw Error('Missing feature definition: '+value);
   }
   await page.getByRole('button',{name:'Cancel',exact:true}).click();
   if(await page.locator('#annotation-dialog').evaluate(n=>n.open))throw Error('Cancel did not close the popup.');
   if(await page.locator('#log-a .current-phrase').count())throw Error('Green highlight remained after cancelling.');
  }],['invalid-quote',async()=>{
   await page.getByRole('button',{name:'Annotate a phrase in A',exact:true}).click();
   if(!await page.locator('#quote').evaluate(n=>n===document.activeElement))throw Error('Keyboard popup did not focus the phrase field.');
   await page.getByRole('button',{name:'Add annotation',exact:true}).click();
   if(!(await page.locator('#annotation-error').innerText()).includes('appears exactly'))throw Error('Popup did not reject an empty phrase.');
   await page.locator('#quote').fill('not present in this answer');
   if(!(await page.locator('#quote-check').innerText()).includes('doesn’t match')&&!(await page.locator('#quote-check').innerText()).includes("doesn't match"))throw Error('Invalid quote feedback missing.');
  }],['annotated',async()=>{
   await page.locator('#quote').fill('You could');
   await page.locator('#category').selectOption('certainty');
   await page.locator('#interpretation').fill('Could offers a suggestion instead of a command, supporting a careful tutor persona.');
   await page.getByRole('button',{name:'Add annotation',exact:true}).click();
   if(await page.locator('#annotation-dialog').evaluate(n=>n.open))throw Error('Popup stayed open after adding.');
   if(await page.locator('#annotations-a .evidence-item').count()!==1||await page.locator('#annotations-b .evidence-item').count()!==0)throw Error('Annotation was not filed under Persona A only.');
   const row=await page.locator('#annotations-a .evidence-item').first().evaluate(li=>{const t=li.querySelector('.evidence-text').getBoundingClientRect(),b=li.querySelector('button').getBoundingClientRect();return {sameLine:b.top<t.bottom&&b.bottom>t.top,right:b.left>=t.right-1};});
   if(!row.sameLine||!row.right)throw Error('Delete button is not on the right of its annotation.');
  }],['both-answers-and-snapshot',async()=>{
   await page.getByRole('button',{name:'Annotate a phrase in B',exact:true}).click();
   await page.locator('#quote').fill('Let’s tackle');
   await page.locator('#category').selectOption('evaluation');
   await page.locator('#interpretation').fill('Let’s suggests a collaborative peer relationship; the exclamation conveys enthusiasm.');
   await page.locator('#annotate').click();await page.locator('#save-pair').click();
   if(await page.locator('#annotations-b .evidence-item').count()!==1)throw Error('Persona B annotation missing.');
   if(await page.locator('#history details').count()!==1)throw Error('Snapshot missing.');
   await page.locator('#history summary').click();
   if(!(await page.locator('#history').innerText()).includes('Certainty and hedging')||!(await page.locator('#history').innerText()).includes('Evaluation and affect'))throw Error('Saved history omitted feature categories.');
   await page.locator('#system-a').fill('You are a concise tutor.');
   const [file]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);
   const data=JSON.parse(await readFile(await file.path(),'utf8'));
   if(data.comparisons.length!==1||data.comparisons[0].annotations.length!==2)throw Error('Comparison export omitted annotations or duplicated snapshot.');
   if(!data.comparisons[0].systems.a.includes('Authored'))throw Error('Export replaced source prompts with ungenerated edits.');
   await page.locator('#reflection').fill('Could sounds cautious, while Let’s sounds collaborative.');
   const [notes]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download my notes',exact:true}).click()]);
   if(!(await readFile(await notes.path(),'utf8')).includes('Could sounds cautious'))throw Error('Reflection export lost notes.');
  }],['annotation-removed',async()=>{
   await page.getByRole('button',{name:'Remove annotation 1 for Persona A',exact:true}).click();
   if(await page.locator('#annotations-a .evidence-item').count()!==0||await page.locator('#annotations-b .evidence-item').count()!==1)throw Error('Wrong annotation was removed.');
   if(!await page.locator('#annotate-a').evaluate(n=>n===document.activeElement))throw Error('Deletion lost keyboard focus.');
   const [file]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);
   const data=JSON.parse(await readFile(await file.path(),'utf8'));
   if(data.comparisons[0].annotations.length!==1)throw Error('Download retained deleted evidence.');
  }],['previous-comparison-kept',async()=>{
   await page.getByRole('button',{name:'Use practice answers',exact:true}).click();
   if(await page.locator('.evidence-item').count()!==0||await page.locator('#history details').count()!==1)throw Error('New comparison lost history or retained old active annotations.');
   const [file]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);
   const data=JSON.parse(await readFile(await file.path(),'utf8'));
   if(data.comparisons.length!==2||data.comparisons[0].annotations.length!==1||data.comparisons[1].annotations.length!==0)throw Error('Export mixed comparisons.');
  }],['scrollable-evidence',async()=>{
   for(let n=0;n<8;n++){
    await page.locator('#annotate-a').click();await page.locator('#quote').fill('You could');
    await page.locator('#interpretation').fill('Could frames this advice as a cautious suggestion rather than a command, which supports a careful tutor interpretation.');
    await page.locator('#annotate').click();
   }
   const dims=await page.locator('#annotations-a').evaluate(n=>({height:n.clientHeight,scroll:n.scrollHeight}));
   if(dims.scroll<=dims.height||dims.height>300)throw Error('Evidence list is not constrained to a compact scrollable box.');
   if(!await page.locator('#log-a mark:not(.current-phrase)').count())throw Error('Saved evidence is not highlighted.');
  }]);
  if(pathname.includes('11B_'))states.push(['sentence',async()=>{
   await page.locator('#training-options summary').click();
   if(!(await page.locator('#corpus-help').innerText()).includes('repeating a sentence counts'))throw Error('Training examples lack a purpose explanation.');
   if(!(await page.locator('#stage1').innerText()).includes('37.5%'))throw Error('Default count-to-probability example is missing.');
   const counts=await page.locator('#corpus').inputValue();const studyPairs=counts.trim().split('\n').map(s=>s.trim().split(/\s+/)).filter(ws=>ws[1]==='study');
   if(studyPairs.length!==8||studyPairs.filter(ws=>ws[2]==='language').length!==3)throw Error('Default example no longer matches training data.');
   await page.locator('#training-options summary').click();
   await page.getByRole('button',{name:'Generate a whole sentence',exact:true}).click();
   if(!await page.locator('#inspection-area').isVisible()||!await page.locator('#temperature').isVisible()||await page.locator('#stage2-lock').isVisible())throw Error('Step 2 was not unlocked after generation.');
   if((await page.locator('#context-view').innerText())!=='study')throw Error('Context should show the chosen step.');
   for(const id of ['topk','nucleus','topp','sample','clear'])if(!await page.locator('#'+id).isVisible())throw Error('Routine controls require unnecessary expansion: '+id);
   if(await page.locator('#stage3-lock').isVisible()||await page.locator('#generate').isDisabled())throw Error('Step 3 was not unlocked by a complete sentence.');
   await page.locator('#training-options summary').click();
   await page.locator('#corpus').fill('we study language\nwe study language\nwe study language\nwe study speech');
   if(!await page.locator('#generate').isVisible())throw Error('Step 3 relocked after it had been opened.');
   if((await page.locator('#sentence-output').innerText())!=='Sentence not started.')throw Error('Stale sentence remained.');
   if(!await page.locator('#many').isDisabled())throw Error('Generation allowed with an unbuilt model.');
   await page.getByRole('button',{name:'Build bigram model',exact:true}).click();
   await page.getByRole('button',{name:'Generate a whole sentence',exact:true}).click();
  }]);
  if(pathname.includes('11B_'))states.push(['same-step-comparison',async()=>{
   const snap=()=>page.evaluate(()=>({context:document.getElementById('context-view').textContent,step:document.getElementById('inspect-step').value,sentence:document.getElementById('sentence-output').textContent,base:Array.from(document.querySelectorAll('#distribution tr')).map(n=>n.children[2].textContent),final:Array.from(document.querySelectorAll('#distribution tr')).map(n=>n.children[5].textContent)}));
   const before=await snap();
   await page.locator('#temperature').fill('0.5');
   const after=await snap();
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
  }],['top-k-cutoff',async()=>{
   await page.locator('#topk').fill('1');
   const probs=await page.locator('#distribution tr').evaluateAll(ns=>ns.map(n=>Number(n.children[5].textContent.replace('%',''))));
   if(probs[0]!==100||probs.slice(1).some(n=>n!==0))throw Error('Top-k=1 failed to exclude lower candidates.');
   if(!(await page.locator('#probability-charts').innerText()).includes('Top-k cutoff'))throw Error('Top-k cutoff line lacks its label.');
  }],['nucleus-and-greedy',async()=>{
   await page.locator('#topk').fill('0');await page.locator('#topp').fill('0.7');
   const before=await page.locator('#distribution').innerText();
   await page.locator('#nucleus').selectOption('topq');
   if(await page.locator('#distribution').innerText()!==before)throw Error('Equivalent top-q notation changed the distribution.');
   if((await page.locator('#cutoff-label').innerText())!=='Top-q')throw Error('Nucleus label did not follow the notation.');
   await page.locator('#temperature').fill('0');
   const probs=await page.locator('#distribution tr').evaluateAll(ns=>ns.map(n=>Number(n.children[5].textContent.replace('%',''))));
   if(probs[0]!==100||probs.slice(1).some(n=>n!==0))throw Error('Greedy temperature failed.');
  }],['invalid-recovery',async()=>{
   const sentence=await page.locator('#sentence-output').innerText();
   await page.locator('#temperature').fill('-1');
   if(!await page.locator('#sample').isDisabled()||!await page.locator('#probability-panel').isHidden())throw Error('Invalid settings retained a usable stale distribution.');
   if(!(await page.locator('#settings-error').innerText()).includes('temperature'))throw Error('Settings error is not shown beside the settings.');
   if(await page.locator('#sentence-output').innerText()!==sentence)throw Error('Invalid settings erased the saved sentence.');
   await page.locator('#temperature').fill('1');
   if(await page.locator('#sample').isDisabled()||!await page.locator('#probability-panel').isVisible())throw Error('Valid settings did not recover.');
  }],['corpus-rebuild',async()=>{
   await page.locator('#corpus').fill('we study words\nwe study sounds');
   if(!await page.locator('#many').isDisabled()||!await page.locator('#sample').isDisabled())throw Error('Corpus edit failed to lock stale generation.');
   await page.locator('#train').click();await page.locator('#many').click();
   if(await page.locator('#generate').isDisabled())throw Error('Rebuilt model lost Step 3.');
  }],['optional-step-and-recovery',async()=>{
   await page.locator('#clear').click();
   if(!await page.locator('#inspection-area').isHidden()||!await page.locator('#stage2-lock').isVisible())throw Error('Restart did not return to the first step.');
   await page.locator('#sample').click();
   if(!await page.locator('#inspection-area').isVisible())throw Error('Optional word stepping did not reveal inspection.');
   await page.locator('#temperature').fill('-1');
   await page.locator('#train').click();
   if(!await page.locator('#temperature').isVisible())throw Error('Invalid controls were hidden during rebuilding, blocking recovery.');
   await page.locator('#temperature').fill('1');await page.locator('#many').click();
   if(await page.locator('#sentence-output').innerText()==='Sentence not started.')throw Error('Recovered model could not finish a sentence.');
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
