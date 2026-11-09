-- Índices adicionais sugeridos pelo advisor do Supabase após a migração inicial.
CREATE INDEX IF NOT EXISTS project_journal_created_by_idx
  ON public.project_journal (created_by);
CREATE INDEX IF NOT EXISTS project_journal_supersedes_project_idx
  ON public.project_journal (supersedes_id, project_id)
  WHERE supersedes_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS project_journal_task_project_idx
  ON public.project_journal (task_id, project_id)
  WHERE task_id IS NOT NULL;
