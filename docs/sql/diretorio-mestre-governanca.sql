
-- Diretório Mestre: vínculo opcional de tarefas e diário de projeto.
-- Mantém tarefas preexistentes e módulos atuais.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.managed_projects(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS tasks_project_status_due_idx
  ON public.tasks (project_id, status, data_limite) WHERE project_id IS NOT NULL;
GRANT SELECT ON public.tasks TO authenticated;

CREATE TABLE IF NOT EXISTS public.project_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.managed_projects(id) ON DELETE RESTRICT,
  task_id uuid REFERENCES public.tasks(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('progresso','decisao','bloqueio','validacao','handoff','nota')),
  state text NOT NULL DEFAULT 'registrado'
    CHECK (state IN ('registrado','proposto','aprovado','rejeitado')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  source_ref text,
  supersedes_id uuid REFERENCES public.project_journal(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_journal_decision_state_check
    CHECK ((kind = 'decisao' AND state IN ('proposto','aprovado','rejeitado'))
       OR (kind <> 'decisao' AND state = 'registrado')),
  CONSTRAINT project_journal_not_self_superseding CHECK (supersedes_id IS DISTINCT FROM id)
);
CREATE INDEX IF NOT EXISTS project_journal_project_created_idx
  ON public.project_journal (project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS project_journal_task_created_idx
  ON public.project_journal (task_id,created_at DESC) WHERE task_id IS NOT NULL;
ALTER TABLE public.project_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_journal FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.project_journal TO authenticated;
GRANT ALL ON public.project_journal TO service_role;

CREATE POLICY project_journal_management_select ON public.project_journal
  FOR SELECT TO authenticated
  USING ((select app_private.is_manager()) AND EXISTS
   (SELECT 1 FROM public.managed_projects p WHERE p.id = project_id
    AND (p.slug <> 'personal-os' OR (select app_private.is_owner()))));
CREATE POLICY project_journal_management_insert ON public.project_journal
  FOR INSERT TO authenticated
  WITH CHECK ((select app_private.is_manager())
   AND created_by = (select auth.uid())
   AND EXISTS
   (SELECT 1 FROM public.managed_projects p WHERE p.id = project_id
    AND (p.slug <> 'personal-os' OR (select app_private.is_owner())))
   AND (task_id IS NULL OR EXISTS
    (SELECT 1 FROM public.tasks t WHERE t.id=task_id AND t.project_id=project_id))
   AND (supersedes_id IS NULL OR EXISTS
    (SELECT 1 FROM public.project_journal j WHERE j.id=supersedes_id AND j.project_id=project_id)));

-- Somente gestores podem vincular/revincular tarefas a projetos;
-- equipes podem continuar trabalhando em tarefas sem mudar seu vínculo.
CREATE OR REPLACE FUNCTION app_private.guard_task_project_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF current_user NOT IN ('postgres','service_role') THEN
   IF TG_OP = 'INSERT' THEN
     IF NEW.project_id IS NOT NULL AND NOT (SELECT app_private.is_manager()) THEN
       RAISE EXCEPTION 'Apenas a gestao pode vincular tarefas a projetos';
     END IF;
   ELSIF NEW.project_id IS DISTINCT FROM OLD.project_id AND NOT (SELECT app_private.is_manager()) THEN
     RAISE EXCEPTION 'Apenas a gestao pode alterar o projeto de uma tarefa';
   END IF;
   IF NEW.project_id IS NOT NULL
    AND (SELECT p.slug FROM public.managed_projects p WHERE p.id=NEW.project_id) = 'personal-os'
    AND NOT (SELECT app_private.is_owner()) THEN
      RAISE EXCEPTION 'Acesso reservado ao titular do Personal OS';
   END IF;
 END IF;
 RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS guard_task_project_assignment ON public.tasks;
CREATE TRIGGER guard_task_project_assignment
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_task_project_assignment();

COMMENT ON TABLE public.project_journal IS
'Diario append-only de projetos: decisoes, progresso, validacoes, bloqueios e handoffs. Sem UPDATE/DELETE autenticados.';
COMMENT ON COLUMN public.tasks.project_id IS
'Vinculo opcional ao cadastro mestre de projetos. Tarefas antigas preservadas.';
