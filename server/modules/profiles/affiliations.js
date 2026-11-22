import { Organization, Team, organizationLogo } from '../recruitment/models.js';

export async function profileAffiliations(profile) {
  const [organizations, teams] = await Promise.all([
    Organization.find({ managers: profile.owner }).select('name logoImage updatedAt').sort('name'),
    Team.find({ managers: profile.owner }).select('name organization').populate('organization', 'name logoImage updatedAt').sort('name'),
  ]);
  const shared = new Set(profile.sharedAffiliations);
  return [
    ...organizations.map(org => ({ key: `organization:${org.id}`, organizationId: org.id, organization: org.name, logoUrl: organizationLogo(org), role: 'Organization manager' })),
    ...teams.filter(team => team.organization).map(team => ({ key: `team:${team.id}`, organizationId: team.organization.id, organization: team.organization.name, logoUrl: organizationLogo(team.organization), teamId: team.id, team: team.name, role: 'Team manager' })),
  ].map(item => ({ ...item, published: shared.has(item.key) }));
}
