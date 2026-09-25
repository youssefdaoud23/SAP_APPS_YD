'use strict';

const http = require('http');

const HOST = process.env.MOCK_RFC_HOST || '127.0.0.1';
const PORT = Number(process.env.MOCK_RFC_PORT || 18089);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok:true, adapter:'mock-rfc' });
  if (req.method !== 'POST' || url.pathname !== '/invoke') return send(res, 404, { error:'Not found' });
  const chunks=[];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  let body;
  try { body=JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { return send(res,400,{error:'Invalid JSON'}); }
  if (!body.function) return send(res,400,{error:'function required'});
  return send(res,200,{
    function:body.function,
    parameters:body.parameters || {},
    RETURN:{TYPE:'S',MESSAGE:'Mock RFC call completed'},
    RESULT:{USER:'DEMO',COMPANY:'Invarture',ACTIVE:true}
  });
});

server.listen(PORT,HOST,()=>console.log(`Mock RFC bridge listening on http://${HOST}:${PORT}`));
