"""Build a standalone offline HTML. No server or package installation required."""
from pathlib import Path
import base64,json,re,sys
root=Path(__file__).resolve().parents[3];docs=root/'docs';page=docs/'week_7/7A_backchannel_locations.html';assets=docs/'week_7/7a'
s=page.read_text()
s=s.replace('<link rel="stylesheet" href="../style.css">','<style>'+ (docs/'style.css').read_text()+'</style>')
s=re.sub(r'<link rel="stylesheet" href="7a/applet.css(?:\?[^"]*)?">',lambda m:'<style>'+(assets/'applet.css').read_text()+'</style>',s)
bootstrap=root/'services/presumptive-grounding/vendor/bootstrap.min.css'
s=s.replace('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">','<style>'+bootstrap.read_text()+'</style>')
s=re.sub(r'<link[^>]+href="https://fonts\.[^>]+>','',s)
data=(assets/'data.js').read_text()
for p in assets.glob('*.wav'):data=data.replace('7a/'+p.name,'data:audio/wav;base64,'+base64.b64encode(p.read_bytes()).decode())
for name,content in [('data.js',data),('core.js',(assets/'core.js').read_text()),('applet.js',(assets/'applet.js').read_text()),('classroom.js',(assets/'classroom.js').read_text())]:
 s=re.sub(r'<script src="7a/'+re.escape(name)+r'(?:\?[^"]*)?"(?: defer)?></script>',lambda m:'<script>'+content.replace('</script','<\\/script')+'</script>',s)
s=s.replace('href="../index.html"','href="https://uga-ling2150.github.io/applets/"')
s=s.replace('Only this short recording is loaded.','Both short recordings are included in this offline file.')
out=Path(sys.argv[1]) if len(sys.argv)>1 else root/'services/backchannel-locations/public/index.html';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(s);print(out, out.stat().st_size)
