// SPDX-License-Identifier: MPL-2.0
// 0.3.52: one-time microphone approval for the feedback side panel (a side panel cannot ask by itself).
// Nothing is recorded here: the microphone is opened and closed at once, only to get Chrome's approval.
navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
 stream.getTracks().forEach(t=>t.stop());
 document.getElementById('msg').textContent='אושר ✓ חוזרים לחלונית ולוחצים שוב על 🎤. הלשונית תיסגר לבד.';
 setTimeout(()=>window.close(),1800);
}).catch(()=>{document.getElementById('msg').textContent='המיקרופון לא אושר. אפשר להקליד בחלונית, או לאשר בהגדרות הדפדפן.';});
