# Configuração de Permissões — AutoDrive Android

## O que foi feito

### 1. **AndroidManifest.xml** — Permissões declaradas
- ✅ `POST_NOTIFICATIONS` (notificações — Android 13+)
- ✅ `CAMERA` (câmera)
- ✅ `ACCESS_FINE_LOCATION` e `ACCESS_COARSE_LOCATION` (localização)
- ✅ `READ_EXTERNAL_STORAGE` e `WRITE_EXTERNAL_STORAGE` (armazenamento)
- ✅ `RECORD_AUDIO` (áudio)

### 2. **PermissionManager.kt** — Solicita permissões em runtime
- Detecta Android 13+ para `POST_NOTIFICATIONS`
- Pede permissões quando o app abre
- Log de permissões concedidas/negadas

### 3. **MainActivity.kt** — Ativa request de permissões
- Chama `PermissionManager.requestPermissions()` no `onCreate()`
- Kotlin + androidx Activity

### 4. **build.gradle** — Suporte a Kotlin adicionado
- Plugin: `kotlin-android`
- Dependências: `kotlin-stdlib`, `androidx.activity-ktx`

## Como recompilar e testar

### Opção 1: Android Studio (Recomendado)
```bash
# No Android Studio, pressione:
Shift + F10  # Build and Run on device
# OU
# Build → Run 'app'
```

### Opção 2: Linha de comando
```bash
cd android
./gradlew installDebug
```

## O que vai acontecer

1. **App abre no Samsung**
2. **Notificação de permissões** aparece automaticamente
3. **Usuário aprova** as permissões necessárias
4. **App funciona com notificações e recursos nativos ativados**

## Permissões por uso

| Permissão | Uso |
|-----------|-----|
| `POST_NOTIFICATIONS` | Para enviar notificações push |
| `CAMERA` | Para capturar fotos/vídeos (futuro) |
| `ACCESS_*_LOCATION` | Para localização GPS (futuro) |
| `READ/WRITE_EXTERNAL_STORAGE` | Para salvar arquivos (futuro) |
| `RECORD_AUDIO` | Para áudio (futuro) |

## Troubleshooting

Se o app não pedir permissões:
1. Desinstale do Samsung: `./gradlew uninstallDebug`
2. Recompile: `./gradlew installDebug`
3. Permissões devem ser solicitadas no startup

Se a compilação falhar:
- Verifique se Kotlin está instalado em Android Studio
- Execute: `./gradlew clean && ./gradlew build`
- Verifique o arquivo `MainActivity.java` — pode estar duplicado. Se sim, delete-o (manter apenas `MainActivity.kt`)
