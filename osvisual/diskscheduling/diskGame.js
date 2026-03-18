export const DISK = (() => {
  let currentQuestion = null;

  function generateRandomQuestion(){
    const requests = Array.from({ length: 6 }, () => Math.floor(Math.random() * 200));
    const head = Math.floor(Math.random() * 200);
    const direction = (Math.random() < 0.5) ? "left" : "right";
    const algorithms = ["FCFS", "SSTF", "SCAN", "C-SCAN", "LOOK", "C-LOOK"];
    const algorithm = algorithms[Math.floor(Math.random() * algorithms.length)];
    return { requests, head, direction, algorithm };
  }

  function questionText(q){
    const dirText = (["SCAN","C-SCAN","LOOK","C-LOOK"].includes(q.algorithm))
      ? ` | Direction: ${q.direction.toUpperCase()}` : '';
    return `Requests: [${q.requests.join(", ")}] | Initial Head: ${q.head} | Algorithm: ${q.algorithm}${dirText}`;
  }

  function normalizeSeq(str){
    return str.split(",").map(x=>parseInt(x.trim(),10)).filter(x=>!Number.isNaN(x));
  }

  function compute(q){
    const { requests, head, direction, algorithm } = q;
    switch (algorithm) {
      case 'FCFS': return fcfs(requests, head);
      case 'SSTF': return sstf(requests, head);
      case 'SCAN': return scan(requests, head, direction);
      case 'C-SCAN': return cscan(requests, head, direction);
      case 'LOOK': return look(requests, head, direction);
      case 'C-LOOK': return clook(requests, head, direction);
      default: return { seekSequence: [], totalMovement: 0 };
    }
  }

  function fcfs(requests, head) {
    let total = 0, seq = [head];
    requests.forEach(r => { total += Math.abs(r - head); head = r; seq.push(r); });
    return { seekSequence: seq, totalMovement: total };
  }

  function sstf(requests, head) {
    let arr = [...requests], seq = [head], total = 0;
    while (arr.length > 0) {
      let closest = arr.reduce((a,b)=>Math.abs(a-head)<Math.abs(b-head)?a:b);
      total += Math.abs(head - closest);
      head = closest;
      seq.push(closest);
      arr.splice(arr.indexOf(closest),1);
    }
    return { seekSequence: seq, totalMovement: total };
  }

  function scan(requests, head, direction, diskSize = 199) {
    const sorted = [...requests].sort((a,b)=>a-b);
    const left = sorted.filter(r=>r<head);
    const right = sorted.filter(r=>r>=head);
    let seq=[head], total=0;

    if(direction==="left"){
      for(let i=left.length-1;i>=0;i--){total+=Math.abs(head-left[i]);head=left[i];seq.push(head);}
      if(head!==0){total+=head;head=0;seq.push(0);}
      for(let i=0;i<right.length;i++){total+=Math.abs(head-right[i]);head=right[i];seq.push(head);}
    }else{
      for(let i=0;i<right.length;i++){total+=Math.abs(head-right[i]);head=right[i];seq.push(head);}
      if(head!==diskSize){total+=Math.abs(diskSize-head);head=diskSize;seq.push(diskSize);}
      for(let i=left.length-1;i>=0;i--){total+=Math.abs(head-left[i]);head=left[i];seq.push(head);}
    }
    return { seekSequence: seq, totalMovement: total };
  }

  function cscan(requests, head, direction, diskSize = 199) {
    const sorted = [...requests].sort((a,b)=>a-b);
    const left=sorted.filter(r=>r<head);
    const right=sorted.filter(r=>r>=head);
    let seq=[head], total=0;

    for(let i=0;i<right.length;i++){total+=Math.abs(head-right[i]);head=right[i];seq.push(head);}
    if(head!==diskSize){total+=Math.abs(diskSize-head);head=diskSize;seq.push(diskSize);}
    seq.push(0); head=0; // jump (we keep it in sequence like your version)
    for(let i=0;i<left.length;i++){total+=Math.abs(head-left[i]);head=left[i];seq.push(head);}
    return { seekSequence: seq, totalMovement: total };
  }

  function look(requests, head, direction) {
    const sorted = [...requests].sort((a,b)=>a-b);
    const left=sorted.filter(r=>r<head);
    const right=sorted.filter(r=>r>=head);
    let seq=[head], total=0;

    if(direction==="left"){
      for(let i=left.length-1;i>=0;i--){total+=Math.abs(head-left[i]);head=left[i];seq.push(head);}
      for(let i=0;i<right.length;i++){total+=Math.abs(head-right[i]);head=right[i];seq.push(head);}
    }else{
      for(let i=0;i<right.length;i++){total+=Math.abs(head-right[i]);head=right[i];seq.push(head);}
      for(let i=left.length-1;i>=0;i--){total+=Math.abs(head-left[i]);head=left[i];seq.push(head);}
    }
    return { seekSequence: seq, totalMovement: total };
  }

  function clook(requests, head, direction) {
    const sorted = [...requests].sort((a,b)=>a-b);
    const left=sorted.filter(r=>r<head);
    const right=sorted.filter(r=>r>=head);
    let seq=[head], total=0;

    for(let i=0;i<right.length;i++){total+=Math.abs(head-right[i]);head=right[i];seq.push(head);}
    if(left.length>0){total+=Math.abs(head-left[0]);head=left[0];seq.push(left[0]);}
    for(let i=1;i<left.length;i++){total+=Math.abs(head-left[i]);head=left[i];seq.push(head);}
    return { seekSequence: seq, totalMovement: total };
  }

  function loadQuestion(payload){
    currentQuestion = payload;
    const qt = document.getElementById("questionText");
    if(qt) qt.textContent = questionText(payload);
    const ans = document.getElementById("studentAnswer");
    if(ans) ans.value = "";
    const fb = document.getElementById("feedback");
    if(fb) fb.textContent = "";
  }

  function evaluateAnswerFromUI(){
    const raw = document.getElementById("studentAnswer").value.trim();
    const studentSeq = normalizeSeq(raw);

    const correct = compute(currentQuestion);
    const correctSeq = correct.seekSequence;

    const isCorrect = JSON.stringify(studentSeq) === JSON.stringify(correctSeq);

    return {
      isCorrect,
      answer: { seq: studentSeq },
      meta: { correctTotalMovement: correct.totalMovement, correctSeq }
    };
  }

  return {
    generateRandomQuestion,
    loadQuestion,
    evaluateAnswerFromUI
  };
})();
