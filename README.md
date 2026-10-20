# Amigo Oculto Família Souza com S e Z

Site estático em HTML, CSS e JavaScript para cada pessoa criar um perfil, cadastrar de 2 a 3 ideias de presente e manter a lista atualizada. A foto enviada pela família aparece no destaque da página. Qualquer visitante pode consultar as listas publicadas; idade e telefone ficam restritos ao perfil privado.

## Publicar com Supabase

O site usa o Supabase para SMS de acesso e armazenamento online. O frontend não contém chave secreta: somente a chave pública `anon`/publishable, protegida pelas políticas RLS do banco.

1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. No **SQL Editor**, execute todo o conteúdo de [`supabase.sql`](supabase.sql). Ele cria os perfis privados, a vitrine pública sem telefone/idade, as políticas de acesso e os gatilhos de sincronização.
3. No painel do projeto, abra **Authentication → Sign In / Providers → Phone** e ative o login por telefone. Configure um provedor de SMS e confirme que o modelo de mensagem contém `{{ .Token }}`. O Supabase exige um provedor de SMS configurado para enviar os códigos. Consulte o [guia oficial de login por telefone](https://supabase.com/docs/guides/auth/phone-login).
4. Em **Project Settings → API**, copie a **Project URL** e a chave pública **anon** (ou **publishable**). Nunca use `service_role` ou uma chave secreta no navegador.
5. Abra [`app.js`](app.js) e preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` no começo do arquivo.
6. Envie estes arquivos ao repositório GitHub. Em **Settings → Pages**, escolha publicar a partir da branch principal e da pasta raiz. O GitHub Pages publica este HTML estático; dados e autenticação continuam no Supabase.

## Uso

- Para criar cadastro, a pessoa informa nome completo, idade e telefone com DDD. Um código SMS confirma que ela controla esse telefone.
- A pessoa escolhe de 2 a 3 produtos. O link é opcional; se preenchido, deve ser `http://` ou `https://`.
- A lista pública mostra apenas nome, produtos e links. Telefone e idade nunca são enviados à tabela pública.
- O botão **Minha lista** permite editar os produtos depois de entrar novamente com SMS.

## Notas

- Sem URL e chave do Supabase, o layout abre, mas não é possível fazer cadastro nem carregar listas online.
- A conta do provedor de SMS pode ter custos e limites próprios. Proteja o projeto Supabase e configure limites antiabuso de SMS no painel.
- O telefone é usado como identificador de login; a política do banco autoriza cada pessoa a alterar apenas o perfil cujo ID corresponde à sessão autenticada.
