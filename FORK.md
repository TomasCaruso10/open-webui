
1) Actualizar main (mi fork) con upstream
git checkout main
git fetch upstream
git merge upstream/main
git push origin main


2) Rebase en Custom Branch a actualizar
git checkout inefop
git rebase main
git push --force-with-lease

3) Historial de Cambios (inefop branch)

### 2026-02-01: Control de Instrumentación SQLAlchemy
- Se agregó la variable de entorno `ENABLE_OTEL_SQLALCHEMY`.
- Permite deshabilitar la instrumentación de SQLAlchemy en OpenTelemetry.
- **Default:** `True` (habilitado por defecto).
- Para deshabilitar: `ENABLE_OTEL_SQLALCHEMY=False`.