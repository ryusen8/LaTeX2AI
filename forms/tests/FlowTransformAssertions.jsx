(function(){
var doc=app.activeDocument;
var tf=doc.textFrames.getByName('Flow paragraph text'),g=tf.parent,results=[];
function ok(x,s){if(!x)throw new Error(s);results.push('PASS '+s);}
function poll(){l2aFlowLayout(tf,false);l2aFlowLayout(tf,false);}
function coords(){var o=[tf.textPath.width,tf.textPath.height];for(var i=0;i<g.placedItems.length;i++){var p=g.placedItems[i],m=p.matrix;o.push(p.left,p.top,m.mValueA,m.mValueB,m.mValueC,m.mValueD);}return o;}
function unchanged(before,label){var after=coords();for(var i=0;i<before.length;i++)if(Math.abs(before[i]-after[i])>0.01)throw new Error(label+' value '+i+': '+before[i]+' -> '+after[i]);results.push('PASS '+label);}

poll();g.resize(140,70);var b=coords();poll();unchanged(b,'nonuniform group scaling is preserved');
g.rotate(27);b=coords();poll();unchanged(b,'group rotation is preserved');
var shear=app.getIdentityMatrix();shear.mValueC=0.25;g.transform(shear);b=coords();poll();unchanged(b,'group shear is preserved');
var m=tf.matrix;
tf.characters[0].contents='Additional editable text. '+tf.characters[0].contents;poll();
ok(Math.abs(tf.matrix.mValueB-m.mValueB)<0.001&&Math.abs(tf.matrix.mValueC-m.mValueC)<0.001,'editing after transform preserves text orientation');
ok(l2aFlowTag(tf,'L2AFlowLeadingMode')!=='native','group transforms do not falsely enable manual leading');
var a=g.placedItems[0].matrix;
ok(Math.abs(a.mValueB/a.mValueA+tf.matrix.mValueB/tf.matrix.mValueA)<0.001,'reflowed formulas follow rotated baseline');
var inv=l2aFlowLinear(tf.matrix);g.transform(app.invertMatrix(inv),true,true,true,true,100,Transformation.DOCUMENTORIGIN);poll();
tf.textPath.height=450;poll();ok(Math.abs(tf.textPath.height-450)<0.01,'manual taller frame does not snap back');
tf.textPath.height=30;poll();ok(Math.abs(tf.textPath.height-30)<0.01,'manual shorter frame retains overflow');
tf.textPath.height=500;poll();ok(tf.lines[tf.lines.length-1].end===tf.textRange.end,'enlarging frame restores overset content');
var oldNote=l2aFlowTag(tf,'L2AFlowMetadata');tf.tags.getByName('L2AFlowMetadata').remove();tf.note=oldNote;tf.name='LaTeX2AI flowing text';
l2aFlowMetadata(tf);ok(tf.name==='Flow paragraph text'&&tf.note===''&&l2aFlowTag(tf,'L2AFlowMetadata')===oldNote,'legacy paragraphs migrate without losing metadata');
return results.join('\n');

})();
