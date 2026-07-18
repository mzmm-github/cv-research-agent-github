-- Run this once in the Supabase SQL editor before ingesting PDFs.
-- GEMINI_EMBEDDING_DIMENSIONS is configured to 1536 in backend/.env.

create extension if not exists vector with schema extensions;

create table if not exists documents (
  id bigserial primary key,
  content text,
  metadata jsonb,
  embedding extensions.vector(1536)
);

-- Research artifacts are scoped and de-duplicated through metadata keys such
-- as projectId, fileHash, artifactType, filename, pageNumber and chunkIndex.
create index if not exists documents_metadata_gin_idx
  on documents using gin (metadata jsonb_path_ops);

create or replace function match_documents (
  query_embedding extensions.vector(1536),
  match_count int default null,
  filter jsonb default '{}'
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
