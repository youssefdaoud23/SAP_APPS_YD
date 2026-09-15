'use strict';

const http = require('http');

const PORT = Number(process.env.MOCK_SAP_PORT || 18080);
const expected = `Basic ${Buffer.from('test:secret').toString('base64')}`;
const metadata = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
  <edmx:DataServices xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
    <Schema Namespace="Mock" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
      <EntityType Name="Product">
        <Key><PropertyRef Name="ID" /></Key>
        <Property Name="ID" Type="Edm.String" Nullable="false" />
        <Property Name="Name" Type="Edm.String" />
        <Property Name="Price" Type="Edm.Decimal" />
      </EntityType>
      <EntityContainer Name="MockEntities" m:IsDefaultEntityContainer="true">
        <EntitySet Name="Products" EntityType="Mock.Product" />
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

const server = http.createServer((req, res) => {
  if (req.headers.authorization !== expected) {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Basic realm="Mock SAP"');
    return res.end('Unauthorized');
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/service/' && req.headers['x-csrf-token'] === 'Fetch') {
    res.setHeader('x-csrf-token', 'mock-csrf-token');
    res.setHeader('Set-Cookie', 'SAP_SESSION=mock; Path=/');
    return res.end(JSON.stringify({ ok: true }));
  }
  if (url.pathname === '/service/$metadata') {
    res.setHeader('Content-Type', 'application/xml');
    return res.end(metadata);
  }
  if (url.pathname === '/service/Products' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ d: { results: [
      { ID: 'P100', Name: 'Demo Product', Price: '42.00' },
      { ID: 'P200', Name: 'Second Product', Price: '84.00' }
    ] } }));
  }
  if (url.pathname === '/service/Products' && req.method === 'POST') {
    if (req.headers['x-csrf-token'] !== 'mock-csrf-token' || !String(req.headers.cookie || '').includes('SAP_SESSION=mock')) {
      res.statusCode = 403;
      return res.end('Missing CSRF/session');
    }
    res.statusCode = 201;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ d: { ID: 'P300', Name: 'Created' } }));
  }
  res.statusCode = 404;
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => console.log(`Mock SAP listening on ${PORT}`));
