// SPDX-License-Identifier: MIT
(function () {
    if (job.done && new File(job.done).exists) return 'OK:already converted';
    var marker='%L2A-EDITABLE-JOB:'+job.id, doc=null, original=null, matches=0, i,j;
    for(i=0;i<app.documents.length;i++) for(j=0;j<app.documents[i].placedItems.length;j++) {
        var item=app.documents[i].placedItems[j];
        if(item.note.indexOf(marker)>=0){doc=app.documents[i];original=item;matches++;}
    }
    if(!matches)return 'WAIT';
    if(matches!==1)return 'ERROR:Ambiguous paragraph target.';
    var group=null,committed=false;
    try {
        doc.activate();var left=original.left,top=original.top,width=job.width;
        if(job.autoWidth){
            var board=doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
            width=Math.max(72,board[2]-left-job.font);
            if(left<board[0]||left>=board[2])width=Math.max(72,board[2]-board[0]-2*job.font);
        }
        group=original.parent.groupItems.add();group.move(original,ElementPlacement.PLACEBEFORE);
        group.name='Flow paragraph '+job.id;group.note='LaTeX2AI original paragraph source\n'+job.source;
        var path=doc.pathItems.rectangle(top,left,width,Math.max(200,job.font*2));
        var tf=doc.textFrames.areaText(path);tf.move(group,ElementPlacement.PLACEATEND);
        tf.name='Flow paragraph text';
        var metadata=new XML('<l2a_flow version="1"/>');metadata.@id=job.id;metadata.@font=job.font;
        metadata.@placement='conform';
        var text='',slot=0;
        for(i=0;i<job.segments.length;i++){
            var segment=job.segments[i];
            if(segment.kind==='text'){text+=segment.text.replace(/\s+/g,' ');continue;}
            if(segment.kind==='break'){text+='\r';continue;}
            if(segment.kind==='display'&&text.length&&text.charAt(text.length-1)!=='\r')text+='\r';
            text+=String.fromCharCode(0xE000+slot);
            if(segment.kind==='display')text+='\r';
            var placed=original.duplicate(group,ElementPlacement.PLACEATEND);placed.note=segment.note;
            var nativePath=original.file.fsName.replace(/\\/g,'/'),suffix=nativePath.lastIndexOf('_LaTeX2AI_');
            if(suffix<0)throw new Error('Unexpected formula link path.');
            var target=new File(nativePath.substring(0,suffix+10)+segment.hash+'.pdf');
            if(!target.exists&&!(new File(segment.file)).copy(target.fsName))throw new Error('Could not save formula link.');
            placed.relink(target);placed.name='LaTeX2AI';
            var tag=placed.tags.add();tag.name='LaTeX2AIFlowSlot';tag.value=String(slot);
            var f=new XML('<formula/>');f.@slot=slot;f.@w=segment.w;f.@h=segment.h;f.@d=segment.d;f.@cap=segment.cap;f.@kind=segment.kind;
            metadata.appendChild(f);slot++;
        }
        tf.contents=text.replace(/\r$/,'');
        tf.textRange.characterAttributes.textFont=app.textFonts.getByName('TimesNewRomanPSMT');
        tf.textRange.characterAttributes.size=job.font;
        var black=new GrayColor();black.gray=100;tf.textRange.characterAttributes.fillColor=black;
        tf.textRange.characterAttributes.autoLeading=true;
        tf.textRange.paragraphAttributes.autoLeadingAmount=135;
        tf.textRange.paragraphAttributes.justification=job.align==='center'?Justification.CENTER:job.align==='right'?Justification.RIGHT:job.align==='justify'?Justification.FULLJUSTIFYLASTLINELEFT:Justification.LEFT;
        tf.textRange.paragraphAttributes.hyphenation=false;
        for(i=0;i<tf.paragraphs.length;i++)if(/^[\uE000-\uE063]\r?$/.test(tf.paragraphs[i].contents))tf.paragraphs[i].paragraphAttributes.justification=Justification.CENTER;
        l2aFlowTag(tf,'L2AFlowMetadata',metadata.toXMLString());
        l2aFlowLayout(tf,true,true);
        original.remove();committed=true;
        doc.selection=null;tf.selected=true;
        if(job.done){var done=new File(job.done);if(done.open('w')){done.write('OK');done.close();}}
        app.redraw();return 'OK:areaText=1;formulas='+slot+';width='+width;
    }catch(error){
        if(!committed&&group)group.remove();
        return 'ERROR:'+error.message+' (line '+error.line+')';
    }
})();
