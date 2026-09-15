import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useClub } from '../ClubContext'

const DEFAULT_TEMPLATES = [
  { name: 'Питание', kind: 'manual', sort_order: 0 },
  { name: 'Проживание', kind: 'manual', sort_order: 1 },
  { name: 'Дорога туда', kind: 'manual', sort_order: 2 },
  { name: 'Дорога обратно', kind: 'manual', sort_order: 3 },
  { name: 'Тренер проживание/питание', kind: 'computed', sort_order: 4 },
  { name: 'Трансфер туда', kind: 'manual', sort_order: 5 },
  { name: 'Трансфер обратно', kind: 'manual', sort_order: 6 },
  { name: 'Тренерские', kind: 'manual', sort_order: 7 },
]
const DEFAULT_SQUADS = [
  { name: 'Состав 1', sort_order: 0 },
  { name: 'Состав 2', sort_order: 1 },
  { name: 'Сопровождающие', sort_order: 2 },
]

async function uploadLogo(clubId, file, setError) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${clubId}/logo-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('club-logos').upload(path, file, { upsert: true })
  if (error) {
    setError('Ошибка загрузки логотипа: ' + error.message)
    return null
  }
  const { data } = supabase.storage.from('club-logos').getPublicUrl(path)
  return data?.publicUrl || null
}

export default function ClubPicker() {
  const { clubs, currentClub, selectClub, reloadClubs, loading } = useClub()
  const navigate = useNavigate()

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [newName, setNewName] = useState('')
  const [newLogoFile, setNewLogoFile] = useState(null)

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editLogoFile, setEditLogoFile] = useState(null)

  // Создавать/переименовывать/удалять клубы (сам список клубов) может
  // только администратор — см. supabase/migration_2026_09_club_admin_only.sql.
  // Пока администраторов вообще нет (самая первая установка), это ещё
  // никому не известно наперёд, поэтому даём управление всем — как только
  // кто-то создаст первый клуб, он сам станет администратором, и дальше уже
  // только он будет видеть эти кнопки.
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminChecked, setAdminChecked] = useState(false)

  async function checkAdmin() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data, error: adminErr } = await supabase.from('app_admins').select('user_id')
    if (!adminErr) {
      const rows = data || []
      setIsAdmin(rows.some((r) => r.user_id === user?.id) || rows.length === 0)
    }
    setAdminChecked(true)
  }

  useEffect(() => {
    checkAdmin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function enterClub(id) {
    selectClub(id)
    navigate('/')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  async function addClub(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setError('')
    setSaving(true)

    // Генерируем id заранее на клиенте вместо того, чтобы просить его назад
    // через .select() у insert: пока мы не в club_members этого клуба, его
    // ещё не видно под защитой доступа (RLS) — INSERT ... RETURNING в таком
    // случае как раз и требует эту видимость, и упал бы с ошибкой прямо на
    // создании самого первого клуба. Так insert обходится без RETURNING.
    const clubId = crypto.randomUUID()
    const { error: clubErr } = await supabase.from('clubs').insert({ id: clubId, name, sort_order: clubs.length })
    if (clubErr) {
      setSaving(false)
      setError('Ошибка создания клуба: ' + clubErr.message)
      return
    }

    // Сразу добавляем себя в участники — иначе из-за защиты доступа (RLS)
    // только что созданный клуб тут же станет никому не виден, включая нас.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error: memErr } = await supabase.from('club_members').insert({ user_id: user.id, club_id: clubId })
    if (memErr) {
      setSaving(false)
      setError('Клуб создан, но не удалось добавить вас в участники: ' + memErr.message)
      return
    }

    if (newLogoFile) {
      const logoUrl = await uploadLogo(clubId, newLogoFile, setError)
      if (logoUrl) await supabase.from('clubs').update({ logo_url: logoUrl }).eq('id', clubId)
    }

    // Стандартный набор статей расходов и составы по умолчанию — чтобы
    // новый клуб не начинал совсем с пустого места (тот же набор, что и на
    // самой первой установке приложения).
    await supabase
      .from('expense_column_templates')
      .insert(DEFAULT_TEMPLATES.map((t) => ({ ...t, club_id: clubId })))
    await supabase.from('squads').insert(DEFAULT_SQUADS.map((s) => ({ ...s, club_id: clubId })))

    // Бутстрап: если администраторов ещё не было вообще, этот клуб стал
    // первым, и создатель становится администратором (разрешено политикой
    // "bootstrap first admin", пока список app_admins пуст). Если админ уже
    // есть (не мы) — insert просто откажет по защите доступа, это ожидаемо,
    // молча игнорируем.
    await supabase.from('app_admins').insert({ user_id: user.id })

    setSaving(false)
    setNewName('')
    setNewLogoFile(null)
    await reloadClubs()
    await checkAdmin()
    enterClub(clubId)
  }

  function startEdit(c) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditLogoFile(null)
    setError('')
  }

  async function saveEdit(c) {
    const name = editName.trim()
    if (!name) return
    setSaving(true)
    setError('')
    let logoUrl = c.logo_url
    if (editLogoFile) {
      const uploaded = await uploadLogo(c.id, editLogoFile, setError)
      if (uploaded) logoUrl = uploaded
    }
    const { error } = await supabase.from('clubs').update({ name, logo_url: logoUrl }).eq('id', c.id)
    setSaving(false)
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    setEditingId(null)
    setEditLogoFile(null)
    reloadClubs()
  }

  async function deleteClub(c) {
    if (
      !confirm(
        `Удалить клуб «${c.name}»? Это возможно, только если в нём ещё нет ни одной поездки/игрока — иначе база откажет с ошибкой, чтобы не потерять данные.`
      )
    ) {
      return
    }
    const { error } = await supabase.from('clubs').delete().eq('id', c.id)
    if (error) {
      setError('Не удалось удалить: ' + error.message + ' (скорее всего, в клубе уже есть данные)')
      return
    }
    if (currentClub?.id === c.id) selectClub(null)
    reloadClubs()
  }

  async function moveClub(index, direction) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= clubs.length) return
    const reordered = [...clubs]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)
    setError('')
    const results = await Promise.all(
      reordered.map((c, i) => supabase.from('clubs').update({ sort_order: i }).eq('id', c.id))
    )
    const failed = results.find((r) => r.error)
    if (failed) {
      setError('Ошибка изменения порядка: ' + failed.error.message)
      return
    }
    reloadClubs()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Клубы</h1>
        <button className="secondary" onClick={handleLogout}>
          Выйти
        </button>
      </div>
      <p className="hint">
        Здесь выбираешь, с каким клубом сейчас работать.
        {adminChecked && isAdmin && (
          <>
            {' '}
            Как администратор ты также можешь добавить новый клуб, переименовать, поменять логотип (едва
            заметным фоном страниц этого клуба) или удалить пустой клуб.
          </>
        )}
        {adminChecked && !isAdmin && (
          <>
            {' '}
            Добавлять, переименовывать и удалять клубы может только администратор — остальным доступна
            работа внутри своего клуба (игроки, поездки, статьи расходов, составы, касса).
          </>
        )}
        {' '}Чтобы добавить в клуб ДРУГОГО человека — это делается вручную в Supabase, см. README.
        {currentClub && (
          <>
            {' '}
            Сейчас выбран клуб «{currentClub.name}» — {' '}
            <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }}>
              вернуться в него
            </a>
            .
          </>
        )}
      </p>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Загрузка...</p>
      ) : clubs.length === 0 ? (
        <p>
          {isAdmin
            ? 'У вас пока нет доступа ни к одному клубу. Создайте свой клуб ниже.'
            : 'У вас пока нет доступа ни к одному клубу. Обратитесь к администратору, чтобы вас добавили в нужный клуб.'}
        </p>
      ) : (
        <table className="trips-table">
          <thead>
            <tr>
              <th></th>
              <th>Логотип</th>
              <th>Название</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clubs.map((c, index) => {
              const isEditing = editingId === c.id
              if (isEditing) {
                return (
                  <tr key={c.id} className="editing-row">
                    <td></td>
                    <td>
                      {c.logo_url && <img src={c.logo_url} alt="" style={{ height: 32, borderRadius: 4 }} />}
                    </td>
                    <td>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setEditLogoFile(e.target.files?.[0] || null)}
                        style={{ marginTop: 6 }}
                      />
                    </td>
                    <td>
                      <button onClick={() => saveEdit(c)} disabled={saving}>
                        {saving ? 'Сохраняем...' : 'Сохранить'}
                      </button>
                      <button className="secondary" onClick={() => setEditingId(null)}>
                        Отмена
                      </button>
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={c.id}>
                  <td className="reorder-cell">
                    {isAdmin && (
                      <>
                        <button
                          className="secondary"
                          onClick={() => moveClub(index, -1)}
                          disabled={index === 0}
                          title="Переместить вверх"
                        >
                          ↑
                        </button>
                        <button
                          className="secondary"
                          onClick={() => moveClub(index, 1)}
                          disabled={index === clubs.length - 1}
                          title="Переместить вниз"
                        >
                          ↓
                        </button>
                      </>
                    )}
                  </td>
                  <td>
                    {c.logo_url ? (
                      <img src={c.logo_url} alt="" style={{ height: 32, borderRadius: 4 }} />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <b>{c.name}</b>
                    {currentClub?.id === c.id && <span className="muted"> (текущий)</span>}
                  </td>
                  <td>
                    <button onClick={() => enterClub(c.id)}>Войти</button>
                    {isAdmin && (
                      <>
                        <button className="secondary" onClick={() => startEdit(c)}>
                          Изм.
                        </button>
                        <button className="danger" onClick={() => deleteClub(c)}>
                          Удалить
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {adminChecked && isAdmin && (
        <>
          <h3>Добавить клуб</h3>
          <form className="card" onSubmit={addClub}>
            <div className="grid">
              <label>
                Название клуба
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Например: Урал-2015"
                />
              </label>
              <label>
                Логотип (необязательно)
                <input type="file" accept="image/*" onChange={(e) => setNewLogoFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <p className="hint" style={{ marginTop: 0 }}>
              Логотип показывается едва заметным водяным знаком на фоне страниц этого клуба — крупная картинка
              на светлом фоне подойдёт лучше всего, JPG/PNG. Новому клубу сразу заводится стандартный набор
              статей расходов и составы (Состав 1/2/Сопровождающие) — их можно будет поменять как обычно.
            </p>
            <button type="submit" disabled={saving} style={{ marginTop: 8 }}>
              {saving ? 'Создаём...' : 'Создать клуб'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
