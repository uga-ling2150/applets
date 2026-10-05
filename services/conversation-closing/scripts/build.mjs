import fs from 'node:fs';
const docs=new URL('../../../docs/',import.meta.url);
let html=fs.readFileSync(new URL('week_10/10A_conversation_opening_closing.html',docs),'utf8');
for(const [tag,file] of [
  ['<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">',new URL('../vendor/bootstrap.min.css',import.meta.url)],
  ['<link rel="stylesheet" href="../style.css">',new URL('style.css',docs)],
  ['<link rel="stylesheet" href="10a/applet.css">',new URL('week_10/10a/applet.css',docs)]
])html=html.replace(tag,()=>'<style>'+fs.readFileSync(file,'utf8')+'</style>');
html=html.replace('<script src="10a/applet.js" defer></script>',()=>'<script>'+fs.readFileSync(new URL('week_10/10a/applet.js',docs),'utf8')+'</script>');
html=html.replace('<script src="../reflection-notes.js" defer></script>',()=>'<script>'+fs.readFileSync(new URL('reflection-notes.js',docs),'utf8')+'</script>');
html=html.replace('href="../index.html"','href="https://uga-ling2150.github.io/applets/"');
html=html.replace('href="../week_9/9A_turn_taking_trps.html"','href="https://uga-ling2150.github.io/applets/week_9/9A_turn_taking_trps.html"');
const output=new URL('../public/',import.meta.url);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(new URL('index.html',output),html);
console.log('Built standalone 10A HTML from the GitHub Pages source.');
