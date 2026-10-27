// Who may be put on a project, and who may decide it. Every check runs here on the server,
// whatever the screen shows, so a direct API call cannot get round it.
import type { Tx } from '../db'
import { can, type AuthUser } from './auth'
import { bad, forbidden, isUuid, notFound } from './http'

export const TEAM_LEADER = 'TEAM_LEAD'

/**
 * Admin (scope "all") and a Manager (scope "department") plan projects: department, Team Leader, manager and members.
 * A Team Leader (scope "team") runs a project but cannot change who is on it.
 */
export const plannerScope = (u: AuthUser) => {
  const s = can(u, 'PROJECTS', 'EDIT')
  return s === 'ALL' || s === 'DEPARTMENT' ? s : null
}

/** The departments a Manager looks after: their own, plus any they head. */
export async function managedDepartments(tx: Tx, u: AuthUser) {
  const headed = await tx.department.findMany({ where: { organizationId: u.organizationId, headId: u.id }, select: { id: true } })
  return [...new Set([...(u.departmentId ? [u.departmentId] : []), ...headed.map((d) => d.id)])]
}

/** Active, not deleted people of the company with their department and role keys. */
export async function people(tx: Tx, organizationId: string, ids: string[]) {
  const rows = ids.length ? await tx.user.findMany({
    where: { id: { in: ids.filter(isUuid) }, organizationId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, status: true, departmentId: true, roles: { select: { role: { select: { key: true } } } } },
  }) : []
  return rows.map((r) => ({ ...r, roleKeys: r.roles.map((x) => x.role.key) }))
}
const nameOf = (p: { firstName: string; lastName?: string | null }) => [p.firstName, p.lastName].filter(Boolean).join(' ')

export interface Plan { departmentId?: string | null; teamLeadId?: string | null; managerId?: string | null; memberIds?: string[] | null; crossDepartment?: boolean | null; extraDepartmentIds?: string[] | null }

/**
 * Checks a project's department, Team Leader, manager and members, and returns the clean values to save.
 * `before` is the saved project when editing (with its extra departments and members), or null when creating.
 */
export async function checkPlan(tx: Tx, u: AuthUser, d: Plan, before: any | null) {
  const org = u.organizationId
  const planner = plannerScope(u)
  const fields = ['departmentId', 'teamLeadId', 'managerId', 'memberIds', 'crossDepartment', 'extraDepartmentIds'] as const
  const touched = fields.filter((f) => d[f] !== undefined)
  if (!planner) {
    // a Team Leader may save the project, but the people and department stay as they are
    const changes = touched.filter((f) => {
      if (!before) return true
      if (f === 'memberIds') return !sameSet(d.memberIds ?? [], before.members.map((m: any) => m.userId))
      if (f === 'extraDepartmentIds') return !sameSet(d.extraDepartmentIds ?? [], before.extraDepartments.map((x: any) => x.departmentId))
      return (d[f] ?? null) !== (before[f] ?? (f === 'crossDepartment' ? false : null))
    })
    if (changes.length) throw forbidden('Only Admin or a Manager can change the department, Team Leader, manager or members of a project')
    return {}
  }
  // editing only the work details (name, dates, status) leaves the people as they are
  if (before && !touched.length) return {}

  const departmentId = d.departmentId !== undefined ? d.departmentId || null : before?.departmentId ?? null
  const cross = d.crossDepartment !== undefined ? !!d.crossDepartment : !!before?.crossDepartment
  if (cross !== !!before?.crossDepartment && u.admin !== true) throw forbidden('Only Admin can make a project cross-department')
  let extra = d.extraDepartmentIds !== undefined ? [...new Set(d.extraDepartmentIds ?? [])] : before?.extraDepartments.map((x: any) => x.departmentId) ?? []
  if (!cross) extra = []
  else if (!u.admin && d.extraDepartmentIds !== undefined && !sameSet(extra, before?.extraDepartments.map((x: any) => x.departmentId) ?? [])) throw forbidden('Only Admin can choose the other departments of a project')

  if (departmentId || extra.length) {
    const found = await tx.department.findMany({ where: { id: { in: [departmentId, ...extra].filter(Boolean).filter((x) => isUuid(x)) as string[] }, organizationId: org }, select: { id: true } })
    if (departmentId && !found.some((x) => x.id === departmentId)) throw notFound('Department')
    if (extra.some((x: string) => !found.some((f) => f.id === x))) throw notFound('Department')
  }
  if (!departmentId && !before && !u.admin) throw bad('Choose the department for this project')
  if (planner === 'DEPARTMENT') {
    const mine = await managedDepartments(tx, u)
    if (departmentId && !mine.includes(departmentId)) throw forbidden('You can only plan projects for your own department')
    if (!departmentId) throw bad('Choose the department for this project')
  }
  const allowed = departmentId ? [departmentId, ...extra] : null
  const inAllowed = (p: { departmentId: string | null }) => !allowed || (!!p.departmentId && allowed.includes(p.departmentId))

  const teamLeadId = d.teamLeadId !== undefined ? d.teamLeadId || null : before?.teamLeadId ?? null
  const managerId = d.managerId !== undefined ? d.managerId || null : before?.managerId ?? null
  const memberIds = d.memberIds !== undefined ? [...new Set(d.memberIds ?? [])] : before ? before.members.map((m: any) => m.userId) : []
  const found = await people(tx, org, [teamLeadId, managerId, ...memberIds].filter(Boolean) as string[])
  const get = (id: string) => found.find((p) => p.id === id)

  if (teamLeadId) {
    const tl = get(teamLeadId)
    if (!tl) throw notFound('Team Leader')
    if (tl.status !== 'ACTIVE') throw bad(`${nameOf(tl)} is not active`)
    if (!tl.roleKeys.includes(TEAM_LEADER)) throw bad(`${nameOf(tl)} is not a Team Leader`)
    if (!inAllowed(tl)) throw bad(`${nameOf(tl)} is not in this project's department`)
  }
  if (managerId) {
    const m = get(managerId)
    if (!m) throw notFound('Project manager')
    if (m.status !== 'ACTIVE') throw bad(`${nameOf(m)} is not active`)
  }
  for (const id of memberIds) {
    const p = get(id)
    if (!p) throw notFound('Team member')
    if (p.status !== 'ACTIVE' && (!before || !before.members.some((m: any) => m.userId === id))) throw bad(`${nameOf(p)} is not active`)
    if (!inAllowed(p)) throw bad(cross ? `${nameOf(p)} is not in the project's departments` : `${nameOf(p)} is in another department. Only Admin can make a project cross-department`)
  }
  // the team the Team Leader leads in this department, so the whole team sees the project
  let teamId: string | null | undefined
  if (d.teamLeadId !== undefined) {
    const team = teamLeadId ? await tx.team.findFirst({ where: { organizationId: org, leadId: teamLeadId }, orderBy: [{ createdAt: 'asc' }], select: { id: true, departmentId: true } }) : null
    teamId = team ? team.id : null
  }
  return { departmentId, teamLeadId, managerId, memberIds: memberIds.filter((id: string) => id !== managerId), crossDepartment: cross, extraDepartmentIds: extra as string[], teamId }
}

/** Saves the members and extra departments chosen in checkPlan, and tells new people. */
export async function savePlan(tx: Tx, project: { id: string; organizationId: string; name: string }, plan: { memberIds?: string[]; extraDepartmentIds?: string[] }, actorId: string, notify: (tx: Tx, org: string, userId: string, type: string, title: string, link?: string) => Promise<unknown>) {
  if (plan.memberIds) {
    const before = await tx.projectMember.findMany({ where: { projectId: project.id }, select: { userId: true } })
    await tx.projectMember.deleteMany({ where: { projectId: project.id, userId: { notIn: plan.memberIds } } })
    const add = plan.memberIds.filter((id) => !before.some((b) => b.userId === id))
    if (add.length) await tx.projectMember.createMany({ data: add.map((userId) => ({ projectId: project.id, userId })), skipDuplicates: true })
    for (const uid of add) if (uid !== actorId) await notify(tx, project.organizationId, uid, 'project.member', `You were added to the project ${project.name}`, '/projects')
  }
  if (plan.extraDepartmentIds) {
    await tx.projectDepartment.deleteMany({ where: { projectId: project.id } })
    if (plan.extraDepartmentIds.length) await tx.projectDepartment.createMany({ data: plan.extraDepartmentIds.map((departmentId) => ({ projectId: project.id, departmentId })) })
  }
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

/**
 * Keeps teams in step with "reports to" when a person is saved:
 * - a Team Leader leads one team in their department, and `teamMemberIds` (when given) are its members, who then report to the leader;
 * - anyone who reports to a Team Leader joins that leader's team;
 * - after a department change, the person leaves teams of other departments.
 */
export async function syncTeams(tx: Tx, organizationId: string, userId: string, teamMemberIds?: string[] | null) {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, firstName: true, lastName: true, departmentId: true, managerId: true, status: true, roles: { select: { role: { select: { key: true } } } }, department: { select: { name: true } } } })
  const isLeader = u.roles.some((r) => r.role.key === TEAM_LEADER)

  // leave teams of other departments
  if (u.departmentId) await tx.teamMember.deleteMany({ where: { userId, team: { organizationId, departmentId: { not: u.departmentId } } } })

  if (isLeader && u.departmentId) {
    let team = await tx.team.findFirst({ where: { organizationId, leadId: userId }, orderBy: { createdAt: 'asc' } })
    const name = `${u.department?.name ?? 'Team'} - ${nameOf(u)}`
    if (!team) team = await tx.team.create({ data: { organizationId, departmentId: u.departmentId, leadId: userId, name } })
    else if (team.departmentId !== u.departmentId) team = await tx.team.update({ where: { id: team.id }, data: { departmentId: u.departmentId } })
    await tx.teamMember.createMany({ data: [{ teamId: team.id, userId }], skipDuplicates: true })
    if (teamMemberIds) {
      const ids = [...new Set(teamMemberIds)].filter((id) => id !== userId)
      const found = await people(tx, organizationId, ids)
      for (const id of ids) {
        const p = found.find((x) => x.id === id)
        if (!p) throw notFound('Team member')
        if (p.status !== 'ACTIVE') throw bad(`${nameOf(p)} is not active`)
        if (p.departmentId !== u.departmentId) throw bad(`${nameOf(p)} is in another department`)
      }
      // people who left the team stop reporting to this leader
      const gone = await tx.teamMember.findMany({ where: { teamId: team.id, userId: { notIn: [...ids, userId] } }, select: { userId: true } })
      await tx.teamMember.deleteMany({ where: { teamId: team.id, userId: { notIn: [...ids, userId] } } })
      if (gone.length) await tx.user.updateMany({ where: { id: { in: gone.map((g) => g.userId) }, managerId: userId }, data: { managerId: null } })
      if (ids.length) {
        await tx.teamMember.createMany({ data: ids.map((id) => ({ teamId: team!.id, userId: id })), skipDuplicates: true })
        await tx.user.updateMany({ where: { id: { in: ids } }, data: { managerId: userId } })
        // a person sits in one Team Leader's team at a time
        await tx.teamMember.deleteMany({ where: { userId: { in: ids }, teamId: { not: team.id }, team: { organizationId, leadId: { not: null } } } })
      }
    }
  }

  if (u.managerId) {
    const lead = await tx.team.findFirst({ where: { organizationId, leadId: u.managerId }, orderBy: { createdAt: 'asc' }, select: { id: true, departmentId: true } })
    if (lead && (!lead.departmentId || lead.departmentId === u.departmentId)) {
      await tx.teamMember.deleteMany({ where: { userId, teamId: { not: lead.id }, team: { organizationId, leadId: { not: null, notIn: [userId] } } } })
      await tx.teamMember.createMany({ data: [{ teamId: lead.id, userId }], skipDuplicates: true })
    }
  }
}

/** The person someone reports to must be active, and a Team Leader must be in the same department. */
export async function checkReportsTo(tx: Tx, organizationId: string, managerId: string | null | undefined, departmentId: string | null | undefined, selfId?: string) {
  if (!managerId) return
  if (managerId === selfId) throw bad('A person cannot report to themselves')
  const [m] = await people(tx, organizationId, [managerId])
  if (!m) throw notFound('Reporting manager')
  if (m.status !== 'ACTIVE') throw bad(`${nameOf(m)} is not active`)
  if (m.roleKeys.includes(TEAM_LEADER) && !m.roleKeys.some((k) => k === 'SUPER_ADMIN' || k === 'MANAGER') && departmentId && m.departmentId !== departmentId) throw bad(`${nameOf(m)} leads a team in another department`)
}
