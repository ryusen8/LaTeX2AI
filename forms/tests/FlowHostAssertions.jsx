(function(){
var d=app.activeDocument,tf=d.textFrames.getByName('Flow paragraph text'),g=tf.parent,results=[];
function ok(x,m){if(!x)throw new Error(m);results.push('PASS '+m);}
function art(n){return g.placedItems[n];}
l2aFlowLayout(tf,true);
ok(tf.name.indexOf('LaTeX2AI')!==0&&tf.note===''&&l2aFlowTag(tf,'L2AFlowMetadata')!=='','prose is not identified as a native formula');
ok(tf.kind===TextType.AREATEXT&&g.textFrames.length===1,'single editable area text');
ok(g.placedItems.length===4,'four linked formulas');
var wide=tf.lines.length;tf.textPath.width=170;l2aFlowLayout(tf,true);
ok(tf.lines.length>wide,'narrow frame wraps text');
ok(tf.lines[tf.lines.length-1].end===tf.textRange.end,'no overset after width change');
tf.textPath.width=400;l2aFlowLayout(tf,true);var w=art(0).width;
tf.textRange.characterAttributes.size=36;l2aFlowLayout(tf,true);
ok(Math.abs(art(0).width/w-2)<0.01,'doubling type size doubles formula size');
tf.textRange.characterAttributes.size=18;tf.textPath.width=280;l2aFlowLayout(tf,true);
var x=art(0).left;
tf.textRange.paragraphAttributes.justification=Justification.RIGHT;l2aFlowLayout(tf,true);
ok(Math.abs(art(0).left-x)>1,'right alignment moves formula anchors');
tf.textRange.paragraphAttributes.justification=Justification.CENTER;l2aFlowLayout(tf,true);
ok(tf.paragraphs[0].paragraphAttributes.justification===Justification.CENTER,'native center alignment');
tf.textRange.paragraphAttributes.justification=Justification.FULLJUSTIFYLASTLINELEFT;l2aFlowLayout(tf,true);
ok(tf.lines[tf.lines.length-1].end===tf.textRange.end,'justified text remains in frame');
var count=d.pageItems.length;
ok(l2aFlowLayout(tf,false)===false&&l2aFlowLayout(tf,false)===false,'stable layout is a no-op');
ok(d.pageItems.length===count,'temporary measurement artwork cleaned up');
var markerIndex=-1;
for(var k=0;k<tf.characters.length;k++)if(tf.characters[k].contents==='\uE000'){markerIndex=k;break;}
tf.characters[markerIndex+1].contents=' newly edited prose'+tf.characters[markerIndex+1].contents;
l2aFlowLayout(tf,true);
ok(tf.characters[markerIndex+1].characterAttributes.fillColor.typename!=='NoColor','typing after formula retains visible prose');
tf.characters[markerIndex].remove();l2aFlowLayout(tf,true);
var hidden=0;for(k=0;k<g.placedItems.length;k++)if(g.placedItems[k].hidden)hidden++;
ok(hidden===1,'deleting one anchor hides only its formula');
tf.characters[markerIndex].contents='\uE000'+tf.characters[markerIndex].contents;l2aFlowLayout(tf,true);
hidden=0;for(k=0;k<g.placedItems.length;k++)if(g.placedItems[k].hidden)hidden++;
ok(hidden===0,'restoring anchor restores formula');
tf.textRange.paragraphAttributes.justification=Justification.LEFT;
for(var i=0;i<tf.paragraphs.length;i++)if(/^[\uE000-\uE063]\r?$/.test(tf.paragraphs[i].contents))tf.paragraphs[i].paragraphAttributes.justification=Justification.CENTER;
l2aFlowLayout(tf,true);d.selection=null;app.redraw();
var saved=new File(new File(job.segments[1].file).parent.fsName+'/flow-host-test.ai');
d.saveAs(saved);d.close(SaveOptions.DONOTSAVECHANGES);d=app.open(saved);
$.global.l2aFlowCache={};
var beforeSaved=d.saved;
ok(l2aFlowTick()==='OK:0'&&l2aFlowTick()==='OK:0'&&d.saved===beforeSaved,'reopened layout remains unchanged');
d.save();
ok(l2aFlowTick()==='OK:0'&&d.saved,'idle monitor leaves saved document clean');
return results.join('\n');
})();
