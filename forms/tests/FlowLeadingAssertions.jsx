// SPDX-License-Identifier: MIT
(function(){
// Reopen the pristine host fixture after the transform tests.
var file=app.activeDocument.fullName;app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
var d=app.open(file),tf=d.textFrames.getByName('Flow paragraph text'),g=tf.parent,results=[];
function ok(value,label){if(!value)throw new Error(label);results.push('PASS '+label);}
function poll(){l2aFlowLayout(tf,false);l2aFlowLayout(tf,false);}
function fixed(value){tf.textRange.characterAttributes.autoLeading=false;tf.textRange.characterAttributes.leading=value;poll();}
function allFixed(value){for(var i=0;i<tf.characters.length;i++){var a=tf.characters[i].characterAttributes;if(a.autoLeading||Math.abs(a.leading-value)>0.01)return false;}return true;}
function lastFormula(){for(var i=0;i<g.placedItems.length;i++)if(l2aFlowTag(g.placedItems[i],'LaTeX2AIFlowSlot')==='3')return g.placedItems[i];throw new Error('Missing formula');}
poll();ok(l2aFlowTag(tf,'L2AFlowLeadingMode')!=='native','ordinary typing and size edits retain managed leading');
fixed(36);ok(allFixed(36)&&l2aFlowTag(tf,'L2AFlowLeadingMode')==='native','manual 36 pt leading includes formula anchors');
var top=lastFormula().top;fixed(54);
ok(allFixed(54)&&lastFormula().top<top-10,'larger leading moves formulas with their text lines');
fixed(12);ok(allFixed(12),'tight leading is not clamped to formula height');
tf.textPath.width=210;poll();ok(allFixed(12),'width reflow preserves manual leading');
tf.characters[0].contents='New text. '+tf.characters[0].contents;poll();ok(allFixed(12),'typing preserves manual leading');
tf.textRange.characterAttributes.size=22;poll();ok(allFixed(12),'font size edits preserve fixed leading');
tf.paragraphs[0].characterAttributes.leading=42;poll();
var firstLeading=tf.characters[0].characterAttributes.leading;
var lastIndex=tf.characters.length-1,lastLeading=tf.characters[lastIndex].characterAttributes.leading;
ok(Math.abs(firstLeading-42)<0.01&&Math.abs(lastLeading-12)<0.01,'mixed paragraph leading remains editable');
tf.textRange.characterAttributes.autoLeading=true;tf.textRange.paragraphAttributes.autoLeadingAmount=170;poll();
var auto=true;for(var i=0;i<tf.characters.length;i++)if(!tf.characters[i].characterAttributes.autoLeading)auto=false;
ok(auto&&Math.abs(tf.paragraphs[0].paragraphAttributes.autoLeadingAmount-170)<0.01,'native automatic leading is preserved');
top=lastFormula().top;tf.textRange.paragraphAttributes.autoLeadingAmount=220;poll();
ok(lastFormula().top<top-10,'automatic leading percentage triggers formula repositioning');
fixed(40);var path=new File(file.parent.fsName+'/flow-leading-'+(d.documentColorSpace===DocumentColorSpace.RGB?'rgb':'cmyk')+'.ai');
d.saveAs(path);d.close(SaveOptions.DONOTSAVECHANGES);d=app.open(path);tf=d.textFrames.getByName('Flow paragraph text');g=tf.parent;
poll();ok(allFixed(40)&&l2aFlowTag(tf,'L2AFlowLeadingMode')==='native','save and reopen preserve manual leading mode');
d.save();poll();ok(d.saved,'idle leading synchronization leaves document clean');
return results.join('\n');
})();
