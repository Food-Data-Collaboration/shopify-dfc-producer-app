import { query } from '../connect.js';

function groupBy(array, keyFn) {
  return array.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ||= []).push(item);
    return acc;
  }, {});
}

export const getPermissions = async (producer) => {
  const result = await query('select pl.id, pl.external_id, pl.description, pl.title, pl.terms_and_conditions, pp.scope from portal_listing pl left join portal_permissions pp on pl.id = pp.portal and pp.producer = $1', [producer]);
  return Object.values(groupBy(result.rows, (row) => row.id))
    .map((group) => ({
      ...group[0],
      scopes: group.map(({ scope }) => scope)
        .filter((scope) => !!scope)
    }));
};

export const updatePermissions = async (producer, portal, scopes) => {
  await query(
    'DELETE from portal_permissions where portal = $1 ',
    [portal]
  );

  await query(
    `INSERT into portal_permissions (producer, portal, scope)
     (SELECT * FROM json_to_recordset($1)
       AS x("producer" integer, "portal" text, "scope" text))
       RETURNING *;`,
    [JSON.stringify(
      scopes.map((scope) => ({ producer, portal, scope }))
    )]
  );

  return null;
};
