# Git: безопасный старт для проекта

Этот файл поможет быстро включить Git, не рискуя утечкой ключей.

## 1) Установить Git
- Windows (winget): `winget install --id Git.Git -e`
- Проверка: `git --version`

## 2) Инициализация и локальная конфигурация
В PowerShell из папки проекта:

```
cd "c:\\Users\\alex7\\Desktop\\New code\\AI\\Codex\\RAG JS s1mple"

# Инициализация репозитория с веткой main
git init -b main

# Безопасные локальные имя/почта (не персональные)
git config --local user.name "local-user"
git config --local user.email "local@example.com"

# Подключить папку с хуками
git config core.hooksPath .githooks

# (опционально) единый стиль окончаний строк
git config core.autocrlf true
```

## 3) Первый коммит
```
# Проверь, что .gitignore подхватил мусор/секреты
git status

# Добавить всё безопасное
git add -A

# Посмотреть, что именно уйдёт в коммит
git diff --cached

# Коммит
git commit -m "chore: init repo (safe baseline)"
```

## 4) Ежедневная работа
- Проверять изменения: `git status`, `git diff`
- Добавлять выборочно: `git add -p`
- Коммитить: `git commit -m "feat: ..."`
- История: `git log --oneline --graph -n 10`

## 5) Предохранители от утечек
- `.gitignore` — уже добавлен (не коммитим `.env`, `knowledge/`, кеши, артефакты).
- `pre-commit` — уже добавлен в `.githooks/pre-commit` и начнёт работать после `git config core.hooksPath .githooks`.
- Перед каждым коммитом смотри `git diff --cached`.

## 6) Если секрет всё же попал
1) Сразу отозвать/ротировать ключ у провайдера.
2) Удалить из файлов.
3) Если коммит ещё не пушили: `git reset --soft HEAD~1`, исправить, закоммитать заново.
4) Если уже в публичной истории — применить `git filter-repo` и форс‑пуш, затем всем обновить локальные копии. Секрет — заменить.

## 7) (Опционально) Приватный удалённый репозиторий
```
# добавление remote (пример)
git remote add origin <ssh-or-https-url>

git push -u origin main
```
На платформе включи secret scanning и репозиторий держи приватным.

---
Примечание: хуки — это локальные проверки, действуют только на твоей машине. На CI можно добавить аналогичные проверки для надёжности.
