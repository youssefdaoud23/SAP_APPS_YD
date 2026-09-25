'use strict';

const rfcConnector = require('../lib/rfcConnector');
const database = require('../lib/database');
const { authorizeConnectionRequest } = require('../lib/connectionPolicy');
const { hasPermission } = require('../lib/securityModel');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks=[]; let size=0;
  for await (const chunk of req) {
    const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk); size += buffer.length;
    if (size > maxBytes) throw Object.assign(new Error('RFC request body is too large.'), { statusCode:413 });
    chunks.push(buffer);
  }
  const text=Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('RFC request body is not valid JSON.'), { statusCode:400 }); }
}

module.exports = async function rfcHandler(req,res) {
  if (!hasPermission(req.principal,'connections.view')) return send(res,403,{error:'Permission connections.view is required.'});
  try {
    const url=new URL(req.url,'http://localhost');
    const action=url.searchParams.get('action') || 'connections';
    const id=String(url.searchParams.get('id') || '').trim().slice(0,120);

    if (req.method==='GET' && action==='connections') {
      return send(res,200,{ connections:rfcConnector.parseConnections().map(rfcConnector.publicConnection) });
    }
    if (req.method==='GET' && action==='health' && id) {
      return send(res,200,await rfcConnector.health(id));
    }
    if (req.method==='POST' && action==='invoke' && id) {
      const input=await readBody(req);
      const connection=rfcConnector.getConnection(id);
      const name=rfcConnector.functionName(input.function);
      const readOnly=rfcConnector.isReadOnly(connection,name);
      const decision=authorizeConnectionRequest(req.principal,connection,readOnly?'GET':'POST');
      if (!decision.ok) return send(res,decision.status,{error:decision.error});
      const result=await rfcConnector.invoke(id,name,input.parameters || {},{timeoutMs:input.timeoutMs});
      if (database.enabled()) {
        database.audit('rfc.invoked',req.principal.username,'rfc-function',name,{connectionId:id,readOnly,status:'success'}).catch(()=>{});
      }
      return send(res,200,result);
    }
    return send(res,404,{error:'Unknown RFC/BAPI action.'});
  } catch (error) {
    if (error.name==='AbortError') return send(res,504,{error:'RFC/BAPI bridge request timed out.'});
    return send(res,Number(error.statusCode)||502,{error:error.message || 'RFC/BAPI request failed.'});
  }
};
