// A short OpenAPI 3.1 description of the public API, so others can generate clients.
export function openapi(origin: string) {
  const slug = { name: 'slug', in: 'path', required: true, schema: { type: 'string', example: 'osun' }, description: 'Election, e.g. osun' };
  const q = (name: string, description: string, type = 'string') => ({ name, in: 'query', schema: { type }, description });
  const get = (summary: string, parameters: object[] = [], type = 'application/json') => ({
    get: { summary, parameters: [slug, ...parameters], responses: { 200: { description: 'OK', content: { [type]: {} } } } },
  });
  return {
    openapi: '3.1.0',
    info: {
      title: 'Recount API',
      version: '1.0',
      description: 'Every IReV polling-unit result sheet, read by Meta Muse Spark and SAM 3.1 and checked. Unofficial: only INEC declares results. Read endpoints are open (CORS *), no key needed.',
    },
    servers: [{ url: origin }],
    paths: {
      '/api/elections': { get: { summary: 'Elections with at least one sheet read', responses: { 200: { description: 'OK' } } } },
      '/api/nigeria': get('Every polling unit in Nigeria by state, and how many are covered for 16 January 2027'),
      '/api/nigeria/units': get('Search all ~176,000 polling units by code, name, ward or LGA', [q('q', 'Code like 24/11/04/012, or a name'), q('state', 'Limit to one state'), q('limit', 'Default 20, max 100', 'integer')]),
      '/api/nigeria/unit/{code}': { get: { summary: 'One polling unit: location, 2027 pledges, 2023 upload time, and every election Recount has read there', parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string', example: '29-17-03-007' } }], responses: { 200: { description: 'OK' } } } },
      '/api/nigeria/state/{state}': { get: { summary: 'Coverage for 2027 by LGA in one state', parameters: [{ name: 'state', in: 'path', required: true, schema: { type: 'string', example: 'LAGOS' } }], responses: { 200: { description: 'OK' } } } },
      '/api/nigeria/pledge': { post: { summary: 'Pledge to photograph the result at a unit on 16 January 2027. No name or phone is stored', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['code'], properties: { code: { type: 'string' }, role: { type: 'string', enum: ['voter', 'agent', 'observer', 'journalist'] } } } } } }, responses: { 200: { description: 'Saved' } } } },
      '/api/nigeria/replay': get('The 2023 presidential upload night by state, in 30-minute steps over ten days, from IReV upload times'),
      '/api/nigeria/situation': get('Situation room: reports from polling units by kind and state, and the latest reports', [q('hours', 'Window, default 24, max 720', 'integer'), q('state', 'Limit to one state')]),
      '/api/nigeria/report': { post: { summary: 'Report what is happening at a polling unit, as one of a fixed list of kinds. No name, number or address is stored', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['code', 'kind'], properties: { code: { type: 'string', example: '29/17/03/007' }, kind: { type: 'string', enum: ['calm', 'late', 'bvas', 'turned_away', 'vote_buying', 'violence', 'snatched', 'no_result', 'posted', 'pvc'] } } } } } }, responses: { 200: { description: 'Saved, with every report for that unit' } } } },
      '/api/{slug}/replay': get('Election night by LGA in 10-minute steps, with first upload, milestones, stalls, replaced sheets and serious flags'),
      '/api/{slug}/pack': get('Evidence pack for a unit, ward or LGA: IReV files with SHA-256 fingerprints, readings, flags and citizen copies', [q('pu', 'Polling unit id'), q('lga', 'LGA name'), q('ward', 'Ward name, with lga'), q('download', 'Set to 1 to download as a file')]),
      '/api/{slug}/summary': get('Totals, flag counts, party tally, LGAs, upload timeline'),
      '/api/{slug}/units': get('Polling units with figures and flags, filtered and paged', [
        q('lga', 'LGA name'), q('ward', 'Ward name'), q('code', 'Polling unit code, any separator: 29-11-07-015'),
        q('status', 'clean | flagged | missing | error'), q('severity', 'high | medium | low'), q('flag', 'Flag code, e.g. over_voting'),
        q('q', 'Text search on name, ward or code'), q('limit', '1-1000, default 100', 'integer'), q('offset', 'Default 0', 'integer'),
      ]),
      '/api/{slug}/pu/{id}': { get: { summary: 'Full reading of one sheet: figures, marks, flags', parameters: [slug, { name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } } },
      '/api/{slug}/pu/{id}/card.txt': { get: { summary: 'Plain-text card for WhatsApp, SMS and chat bots', parameters: [slug, { name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK', content: { 'text/plain': {} } } } } },
      '/api/{slug}/collation': get('Polling-unit sheets added up by LGA or ward, like the EC8C and EC8B forms', [q('by', 'lga (default) | ward'), q('lga', 'Limit to one LGA')]),
      '/api/{slug}/collation/check': {
        post: {
          summary: 'Compare a ward (EC8B) or LGA (EC8C) collation figure with the polling-unit sheets under it',
          parameters: [slug],
          requestBody: { required: true, content: { 'application/json': { example: { lga: 'IFE CENTRAL', ward: 'IREMO III', votes: { A: 2105, APC: 1830 }, accredited: 4100, totalValid: 3990, source: 'EC8B photo from the ward collation centre' } } } },
          responses: { 200: { description: 'verdict matches | differs, per-party gaps and coverage' } },
        },
      },
      '/api/{slug}/collation/photo': {
        post: {
          summary: 'Upload a photo of a ward (EC8B) or LGA (EC8C) collation sheet. Muse Spark copies every row; poll GET /api/{slug}/collation/photo/{id} for the row-by-row check against IReV',
          parameters: [slug],
          requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['image'], properties: { image: { type: 'string', format: 'binary' } } } } } },
          responses: { 200: { description: '{ id, status }' } },
        },
      },
      '/api/{slug}/collation/photo/{id}': { get: { summary: 'A collation photo: status, and once read, each row against its IReV sheet, the sheet\'s own arithmetic, and units it leaves out', parameters: [slug, { name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } } },
      '/api/{slug}/collation/read-check': { post: { summary: 'Check a collation-sheet reading you already have (the same JSON the reader produces) against IReV', parameters: [slug], responses: { 200: { description: 'verdict, rows, arithmetic, totals, missing' } } } },
      '/api/{slug}/copies': {
        get: get('Citizen copies: photos of the result taken at the unit, each with where it stands against IReV', [q('pu', 'Limit to one polling unit id'), q('limit', 'Default 50, max 500', 'integer')]).get,
        post: {
          summary: 'Add a photo of the result taken at the unit. No name, phone or location is stored; photo metadata is removed',
          parameters: [slug],
          requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', required: ['image', 'puId', 'role'], properties: {
            image: { type: 'string', format: 'binary' }, puId: { type: 'string' },
            role: { type: 'string', enum: ['voter', 'agent', 'observer', 'journalist'] }, party: { type: 'string' },
            kind: { type: 'string', enum: ['ec60e', 'ec8a', 'other'] }, takenAt: { type: 'string', format: 'date-time' },
            votes: { type: 'string', description: 'JSON object of party to votes, optional' }, totalValid: { type: 'integer' },
          } } } } },
          responses: { 200: { description: 'Saved, with an instant check of any typed figures' }, 429: { description: 'Too many uploads' } },
        },
      },
      '/api/{slug}/copies/conflicts': get('Units where copies from the unit and the IReV sheet disagree'),
      '/api/{slug}/margin': get("INEC's margin-of-lead test against units with no sheet or with over-voting"),
      '/api/{slug}/forensics': get('Turnout distribution, turnout and one-party outliers, last-digit test'),
      '/api/{slug}/changes': get('Sheets uploaded, replaced or read since a moment; poll with since = previous now', [q('since', 'ISO date-time'), q('limit', 'Default 500, max 2000', 'integer')]),
      '/api/{slug}/feed.xml': get('RSS feed of sheets with serious flags', [], 'application/rss+xml'),
      '/api/{slug}/export.csv': get('Every polling unit as CSV', [], 'text/csv'),
      '/api/{slug}/export.json': get('Every polling unit as JSON'),
      '/api/check': { post: { summary: 'Compare a photo of a result sheet with the IReV original (multipart: image, election)', responses: { 200: { description: 'OK' } } } },
    },
  };
}
