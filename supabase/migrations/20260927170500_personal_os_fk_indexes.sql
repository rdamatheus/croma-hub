-- Índices de cobertura para FKs do Personal OS.
-- Mantidos separados dos índices funcionais já criados na migration inicial.

create index if not exists personal_os_activity_log_actor_idx on personal_os.activity_log(actor_user_id);
create index if not exists personal_os_areas_user_idx on personal_os.areas(user_id);
create index if not exists personal_os_check_ins_user_idx on personal_os.check_ins(user_id);
create index if not exists personal_os_events_user_idx on personal_os.events(user_id);
create index if not exists personal_os_goals_user_idx on personal_os.goals(user_id);
create index if not exists personal_os_goals_area_workspace_idx on personal_os.goals(area_id,workspace_id);
create index if not exists personal_os_projects_user_idx on personal_os.projects(user_id);
create index if not exists personal_os_projects_area_workspace_idx on personal_os.projects(area_id,workspace_id);
create index if not exists personal_os_projects_goal_workspace_idx on personal_os.projects(goal_id,workspace_id);
create index if not exists personal_os_tasks_user_idx on personal_os.tasks(user_id);
create index if not exists personal_os_tasks_area_workspace_idx on personal_os.tasks(area_id,workspace_id);
create index if not exists personal_os_tasks_project_workspace_idx on personal_os.tasks(project_id,workspace_id);
create index if not exists personal_os_tasks_route_step_workspace_idx on personal_os.tasks(route_step_id,workspace_id);
create index if not exists personal_os_ideas_user_idx on personal_os.ideas(user_id);
create index if not exists personal_os_ideas_area_workspace_idx on personal_os.ideas(area_id,workspace_id);
create index if not exists personal_os_ideas_project_workspace_idx on personal_os.ideas(project_id,workspace_id);
create index if not exists personal_os_routines_user_idx on personal_os.routines(user_id);
create index if not exists personal_os_routines_area_workspace_idx on personal_os.routines(area_id,workspace_id);
create index if not exists personal_os_decisions_user_idx on personal_os.decisions(user_id);
create index if not exists personal_os_decisions_area_workspace_idx on personal_os.decisions(area_id,workspace_id);
create index if not exists personal_os_decisions_project_workspace_idx on personal_os.decisions(project_id,workspace_id);
create index if not exists personal_os_routes_created_by_idx on personal_os.routes(created_by);
create index if not exists personal_os_routes_goal_workspace_idx on personal_os.routes(goal_id,workspace_id);
create index if not exists personal_os_route_steps_created_by_idx on personal_os.route_steps(created_by);
create index if not exists personal_os_route_steps_route_workspace_idx on personal_os.route_steps(route_id,workspace_id);
create index if not exists personal_os_platform_admins_created_by_idx on personal_os.platform_admins(created_by);
