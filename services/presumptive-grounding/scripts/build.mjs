import fs from 'node:fs';
const docs=new URL('../../../docs/',import.meta.url);
let html=fs.readFileSync(new URL('week_7/7B_presumptive_grounding.html',docs),'utf8');
for(const [tag,file] of [
 ['<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">',new URL('../vendor/bootstrap.min.css',import.meta.url)],
 ['<link rel="stylesheet" href="../style.css">',new URL('style.css',docs)],
 ['<link rel="stylesheet" href="7b/applet.css">',new URL('week_7/7b/applet.css',docs)]
]) html=html.replace(tag,()=>'<style>'+fs.readFileSync(file,'utf8')+'</style>');
html=html.replace('<script src="7b/applet.js" defer></script>',()=>'<script>'+fs.readFileSync(new URL('week_7/7b/applet.js',docs),'utf8')+'</script>');
html=html.replace('href="../index.html"','href="https://uga-ling2150.github.io/applets/"');
const output=new URL('../public/',import.meta.url);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(new URL('index.html',output),html);
console.log('Built standalone 7B HTML from the GitHub Pages source.');
