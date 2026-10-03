# YKS Takip

YKS öğrencilerinin akademik (haftalık program, konu takibi) ve psikolojik (uyku, erteleme, kaygı, enerji, motivasyon…) takibi için mobil uyumlu web uygulaması. Telefona uygulama gibi eklenebilir, bilgisayardan da açılır.

## Dosyalar

Tüm dosyalar tek düzeydedir, alt klasör yoktur. Vercel derleme sırasında `hazirla.mjs` betiği uygulama dosyalarını otomatik olarak `app` klasörüne yerleştirir; bu yüzden GitHub'a nasıl yüklediğin önemli değildir.

- `schema.sql` → Supabase'de **bir kez** çalıştırılacak veritabanı dosyası
- `guncelleme-2.sql` … `guncelleme-15.sql` → mevcut kurulumlar için güncelleme dosyaları
- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `hazirla.mjs` → ayar dosyaları
- Diğer `.tsx / .ts / .css / .png` dosyaları → uygulamanın kendisi

## Kurulum

### 1) Supabase

1. <https://supabase.com> → **New project** → bölge: **Central EU (Frankfurt)**.
2. **SQL Editor → New query** → `schema.sql` dosyasının tamamını yapıştır → **Run** ("Success").
3. **Authentication → Sign In / Providers** → **Allow new users to sign up: KAPALI** → Save.
4. **Project Settings → API Keys** bölümünden şunları kopyala: **Project URL**, **Publishable key**, **Secret key** (eski projelerde: *anon* ve *service_role*).

### 2) GitHub

1. <https://github.com/new> → yeni bir **Private** depo oluştur (veya mevcut depoyu kullan).
2. **Add file → Upload files** → zip'ten çıkan klasördeki **tüm dosyaları** seç (Ctrl+A) ve yükle → **Commit changes**.
   Mevcut depoya yüklüyorsan aynı adlı dosyaların üzerine yazılır; Vercel otomatik olarak yeniden derler.

### 3) Vercel

1. **Add New… → Project** → depoyu **Import** et.
2. **Environment Variables**:

   | Ad | Değer |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (veya *anon*) |
   | `SUPABASE_SECRET_KEY` | Secret key (veya *service_role*) — gizli |
   | `SETUP_SECRET` | Kendi belirlediğin uzun bir parola |
   | `NEXT_PUBLIC_APP_NAME` | *(isteğe bağlı)* Uygulama adı |

3. **Deploy**. Değişkenleri sonradan değiştirirsen **Deployments → Redeploy**.

### 4) İlk giriş ve öğrenciler

1. Vercel adresini aç → giriş sayfasındaki **"Danışman hesabı oluştur"** → `SETUP_SECRET` + bilgilerin. (Yalnızca bir kez yapılır.)
2. **Yeni öğrenci** → ad veya kod (ör. `ÖĞR-001`), kullanıcı adı (ör. `ogr001`), şifre → **Mesajı kopyala** ile öğrenciye gönder.
3. Telefona ekleme — iPhone: Safari → **Paylaş → Ana Ekrana Ekle**. Android: Chrome → **⋮ → Uygulamayı yükle**.

## Güncelleme 3.5 — 3D ikonlar ve görünüm rötuşu

Boş ekranlarda ("Henüz program yok" vb.) ve ana sayfa kartlarında yumuşak 3D görünümlü ikonlar var (`ikon3d.tsx`; kodla çizilir,
resim dosyası yoktur). Kart gölgeleri ve başlıklar inceltildi. Veritabanı güncellemesi gerekmez.

## Güncelleme 3.4.2 — rozet açıklamaları en altta, açılır-kapanır

Öğrencinin İlerleme sayfasında rozetler ve açıklamaları sayfanın en altına taşındı ve kapalı gelir; başlığa dokununca açılır.
"Rozetler nasıl kazanılır?" kutusu da açılır-kapanır oldu. Veritabanı güncellemesi gerekmez.

## Güncelleme 3.4.1 — DİL öğrencileri için Yabancı Dil (YDT) konuları

Alanı **DİL** olan öğrencilerde Konular'a "Yabancı Dil (İngilizce)" dersi eklendi (dil bilgisi ve kelime 14 konu, soru türleri 11 konu,
kazanımlarıyla). Programda YDT DİL BİLGİSİ / KELİME / OKUMA / ÇEVİRİ / SORU TÜRLERİ ders satırları, deneme girişinde 80 soruluk
**YDT** türü var. Veritabanı güncellemesi gerekmez. Konuları `curriculum.ts` içinde düzenleyebilirsiniz.

## Güncelleme 3.4 — diğer sınavlar, haftalık rapor, veli paneli, yapay zekâ ile soru çözümü

**Kurulum:** dosyaları yükleyin, Supabase'de `guncelleme-hepsi.sql` dosyasını bir kez çalıştırın.

- **Diğer sınavlar:** Öğrencinin "Alan" seçiminde artık **LGS (8. sınıf)** ve **KPSS (GY-GK)** de var. Seçime göre konu listesi,
  kazanımlar, program dersleri, deneme türü ve net hesabı (LGS'de 3 yanlış 1 doğruyu götürür) değişir. **9-10-11. sınıf**
  seçildiğinde yalnızca o sınıfa kadar olan konular gösterilir. Konu listeleri ve sınıf eşlemesi `curriculum.ts` içindedir; düzenleyebilirsiniz.
- **Haftalık rapor:** Her pazar ~20:00'de her öğrenci için kendiliğinden oluşur (menü → Haftalık raporlar). Öğrenci İlerleme
  sayfasında, veli kendi bağlantısında görür; uyku/kaygı gibi kişisel veriler yalnızca danışmana görünür. Veliye yayını öğrenci
  bazında kapatabilir, rapora kısa not ekleyebilirsiniz.
- **Veli paneli:** Mevcut şifresiz veli bağlantısına haftalık rapor arşivi, yaklaşan görüşmeler ve danışmana mesaj bölümü eklendi.
  Veli mesajları öğrencinin "Veli" sekmesinde ve ana sayfadaki "Bugün ilgilenmem gerekenler" kutusunda görünür.
- **Yapay zekâ ile soru çözümü:** Öğrenci Sorular → "Yapay zekâya sor" bölümünden fotoğraf yükler; önce ipucu alır, denedikten
  sonra isterse adım adım çözümü açar. Çalışması için Vercel → Settings → Environment Variables'a `ANTHROPIC_API_KEY`
  ekleyip Redeploy yapın (anahtar: console.anthropic.com → API Keys; kullandıkça ödenir). İsteğe bağlı: `AI_DAILY_LIMIT`
  (öğrenci başına günlük soru, varsayılan 5), `ANTHROPIC_MODEL` (varsayılan `claude-sonnet-5-5`). Öğrenci bazında sınırı
  öğrencinin Sorular sekmesinden değiştirebilir ya da 0 yaparak kapatabilirsiniz. Anahtarı kimseyle paylaşmayın.

## Güncelleme 3.3 — kullanım kolaylığı

SQL gerekmez. Yeni dosyalar: `bugun-kutusu.tsx`, `durum.tsx`.
- **Öğrenci · Bugün**: en üstte tek "Şimdi sıradaki" kartı (sıradaki görev → günlük → "her şey tamam"). 5 dakika modu, sorularım ve haftalık özet "Daha fazla" altında.
- **Öğrenci · Günlük**: uyku ve telefon tek dokunuşla seçilir (hazır değerler, −/+, "dün" işareti); yazılı değerlendirme isteğe bağlı ve kapalı gelir; altta "x/7 alan dolu" göstergeli sabit Kaydet çubuğu.
- **Danışman · Öğrenciler**: "Bugün ilgilenmem gerekenler" kutusu (bugünkü görüşmeler, 3+ gündür günlük doldurmayanlar, geciken görevi birikenler, programı olmayanlar, onay bekleyen forum).
- **Danışman · Öğrenci sayfası**: 11 sekme 4 grupta (Genel, Çalışma, Takip, Veli ve hesap).
- **Ayarlar · Veritabanı durumu**: hangi özelliğin eksik olduğunu gösterir; eksik varsa Öğrenciler sayfasında da uyarı çıkar.

## Güncellemeleri tek seferde yapmak (önerilen)

Hangi `guncelleme-X.sql` dosyalarını çalıştırdığınızdan emin değilseniz ya da uygulamada "Veritabanı güncel değil", "… çalıştırılmalı" uyarısı görüyorsanız:
Supabase → SQL Editor → New query → `guncelleme-hepsi.sql` dosyasının **tamamını** yapıştırın → **Run**. "Destructive operation" uyarısı çıkarsa "Run this query" deyin. Yalnızca eksik tabloları ekler, kuralları ve fonksiyonları yeniler; verileriniz silinmez. Tekrar çalıştırmak güvenlidir.

## Güncelleme 3.2 — görev panosu, görüşme raporu, kazanımlar, rehber videoları

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-15.sql` → **Run**. Yeni dosyalar: `kazanimlar.ts`, `konu-bilgi.tsx`, `gorev-panosu.tsx`, `gorusme-raporu.tsx`, `videolar.tsx`.
- **Görev panosu** (danışman menüsü): tüm öğrencilerin görevleri tek ekranda — Geciken / Bugün / Yaklaşan / Tamamlanan; öğrenci, ders ve metin filtresi; gecikenlere tek tuşla bildirim.
- **Görüşme raporu**: Takvimdeki görüşmenin yanındaki ya da öğrenci sayfasındaki "Görüşme raporu" düğmesi. Son görüşmeden bu yana süre, soru, doğruluk, tamamlama, aktif gün, günlük örüntüleri, denemeler, biten ve zorlanılan konular, geciken görevler ve "görüşmede konuşulabilecekler" listesi. Not görüşmeye kaydedilir; yazdırılır / PDF kaydedilir.
- **Kazanımlar ve alt başlıklar**: 182 konunun hepsi için. Konu takibinde konuya dokununca, program görevlerinde ve görev panosunda "Kazanımlar" ile görünür. Düzenlemek için `kazanimlar.ts`.
- **Rehber videoları**: Danışman YouTube bağlantısı ekler (erteleme, sınav kaygısı, zaman yönetimi, motivasyon, uyku, telefon). Öğrenci alt menüdeki "Videolar" sayfasında izler. Son 3 günün günlüğünde erteleme, plan değişikliği, kaygı ≥ 4, motivasyon ≤ 2, 6 saatten az uyku ya da 3 saatten fazla telefon varsa ilgili videolar ana ekranda "Senin için videolar" olarak önerilir.

## Güncelleme 3.1 — akıcı geçişler

SQL gerekmez. Sayfa geçişlerinde içerik yumuşakça belirir ve menüdeki seçili arka plan yeni sayfaya kayar; sekme ve segment seçicilerde seçim kayarak geçer; kartlar, pencereler, bildirimler, ilerleme çubukları ve grafikler animasyonla açılır. Cihazda "hareketi azalt" ayarı açıksa animasyonlar kapanır. Sayfa geçişi Chrome, Edge ve Safari 18+'da çalışır; diğer tarayıcılarda anında geçer.

## Güncelleme 3.0 — aylık hedefler, konu ve özel gün rozetleri, kutlamalar

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-14.sql` → **Run** (`guncelleme-13.sql` daha önce çalıştırılmış olmalı).
- **Aylık hedef:** Her öğrencinin bu ay için soru ve aktif gün hedefi var. Danışman girmezse otomatik: soru = geçen ayın %10 fazlası (en az 200), aktif gün = geçen ayın 2 fazlası (en az 12, en fazla ayın gün sayısı − 4). Danışman, öğrencinin Özet sekmesindeki "Seri, hedef ve rozetler" kartından elle değiştirebilir. Hedefe ulaşılan her ay bir ay rozeti + "Aylık hedef" rozet serisi.
- **Konu bitirme** (1, 10, 25, 50, 100 konu, sonra her 50) ve **ders tamamlama** rozetleri (bir dersin tüm konuları "Bitti/Tekrar edildi" olunca, 17 ders).
- **Özel gün rozetleri** (yalnızca o gün kazanılır): 1 Ocak, 14 Mart, 23 Nisan, 19 Mayıs, 30 Ağustos, 29 Ekim, 24 Kasım.
- **Büyük kutlama** yalnızca 7, 30 ve 100 günlük çalışma/günlük serisinde; diğer rozetler kısa bildirimle duyurulur.
- Bildirim ve kart metinleri kazanç odaklı ("Bugün 1 görevle serine 1 gün ekle").
- Logo: sekme ve ana ekran simgesi, üst menüdeki logoyla aynı tasarıma getirildi; logo artık renk paletinden bağımsız sabit marka rengini kullanır.

## Güncelleme 2.9 — günlük rozetleri ve sınırsız rozetler

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-13.sql` → **Run** (`guncelleme-11.sql` ve `guncelleme-12.sql` daha önce çalıştırılmış olmalı).
- Yeni rozet türleri: **Günlük serisi** (günlüğü üst üste her gün doldurma), **Eksiksiz günlük** (7 alanın hepsi dolu: uyku, telefon, kaygı, enerji, motivasyon, erteleme, plan değişikliği), **Günlük sadakati** (toplam doldurulan gün).
- Rozetlerin sınırı yok: her türün ilk hedeflerinden sonra belirli aralıklarla yeni rozet gelir (ör. soru: 100, 500, 1.000, 2.500, 5.000, sonra her 2.500).
- Öğrenci her rozetin şartını, sıradaki hedefi ve ilerlemesini görür: **Bugün → seri kartındaki rozetler → Rozetlerim** veya **İlerleme → Rozetlerim**.

## Güncelleme 2.8.2 — öğrenci listesinde rozetler

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-12.sql` → **Run** (`guncelleme-11.sql` daha önce çalıştırılmış olmalı).
Öğrenciler sayfasındaki her kartta güncel seri (gün) ve kazanılan rozetler görünür; rozetin üzerine gelince adı ve açıklaması çıkar.

## Güncelleme 2.8.1 — hatırlatmalar uygulama üzerinden

SQL gerekmez. Öğrenciye giden tüm hatırlatmalar artık WhatsApp yerine uygulama üzerinden gider: mesaj öğrencinin Bugün ekranına not olarak düşer, bildirimi açık olanların telefonuna anlık bildirim de gider.
- Öğrenci sayfası → **Bildirim gönder** (eski "WhatsApp hatırlatma").
- **Hatırlatma** sayfası → satırdaki **Gönder** ya da **Seçilenlere gönder**; bildirimi kapalı öğrenciler "Bildirimi kapalı" etiketiyle görünür.
- Görüşmeler ve Takvim → **Bildirimle hatırlat**.
- Velilere giden veli bağlantısı ve veli raporu paylaşımı WhatsApp'ta kalır (veliler uygulama kullanıcısı değildir).

## Güncelleme 2.8 — veli bağlantısı, otomatik bildirimler, seri ve rozetler

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-11.sql` → **Run**.
Yeni dosyalar: `veli.tsx`, `bildirim.tsx`, `oyun.tsx`, `sw-route.ts`, `bildirim-route.ts`, `vercel.json` (hepsi aynı yere, düz yüklenir; `hazirla.mjs` doğru klasörlere taşır).

**Veli bağlantısı** — Öğrenci → Hesap → "Veli bağlantısı" → Bağlantı oluştur → "Veliye WhatsApp'tan gönder". Veli giriş yapmadan yalnızca o öğrencinin haftalık programını, deneme netlerini, çalışma/soru/tamamlama grafiklerini ve uyku/telefon ortalamalarını görür. Düzenleme yapamaz; kaygı, motivasyon, notlar, destek kayıtları ve soru fotoğrafları gösterilmez. Bağlantı istendiğinde iptal edilir; kaç kez açıldığı görünür.

**Otomatik bildirimler (bir kez kurulum)**
1. Danışman → Ayarlar → Bildirimler → "Anahtarları üret".
2. Vercel → Proje → Settings → Environment Variables'a ekleyin: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (ör. `mailto:siz@eposta.com`), `CRON_SECRET`. Ayrıca `SUPABASE_SECRET_KEY` (veya `SUPABASE_SERVICE_ROLE_KEY`) tanımlı olmalı (danışman ekleme için zaten eklenmiş olabilir).
3. Deployments → son dağıtım → Redeploy.
4. Öğrenciler ve danışmanlar Ayarlar → Bildirimler → "Bildirimleri aç". iPhone'da önce Safari → Paylaş → Ana Ekrana Ekle, sonra uygulamayı ana ekrandan açıp bildirimleri açmak gerekir (iOS 16.4+).

Zamanlar (Vercel ücretsiz planında belirtilen saat içinde herhangi bir dakikada çalışır): kalan görev hatırlatması ~18:00–19:00, günlük takip hatırlatması ~21:00–22:00, danışman akşam özeti ~21:00–22:00. Her kişi ayarlardan türleri tek tek kapatabilir. Aynı gün aynı bildirim iki kez gitmez.

**Seri ve rozetler** — Bir gün, günlük takip doldurulduysa ya da en az bir görev bitirildiyse "seri günü" sayılır. Bugün ekranında seri, haftalık %80 hedefi ve son rozetler; İlerleme ekranında 14 rozetin tamamı. Anonim sıralama ("serinle ilk %20'desin") yalnızca en az 10 aktif öğrenci varken ve öğrenci ilk %50'deyse gösterilir; kimsenin adı veya puanı görünmez. Danışman, öğrencinin Özet sekmesinde seri/rozetleri ve anonim sırasını görür.

## Güncelleme 2.7 — konu ilerlemesi ve çalışma saatlerine otomatik yerleştirme

SQL gerekmez (2.6'nın SQL'leri yeterli). Yeni dosya: `yerlestir.ts`.

- **Soruları biten konu atlanır:** Otomatik programda bir konunun kitaptaki testleri bittiyse (katalogda test → konu eşleşmesi varsa) ya da kitap yoksa o konuda 3 soru görevi tamamlandıysa konu atlanır, bölümdeki sıradaki konuya geçilir. Önizlemede "Soruları biten konular atlandı" kutusunda görünür. Denemede o konuda yanlış varsa "tekrar" olarak yine programa girer.
- **Kitaptan sırayla ilerleme:** Öğrencinin kitabındaki sıradaki konu haftada en az 2 blok alır; bloklara sıradaki testler (ör. T4, T5) otomatik bağlanır. Testler hafta içinde biterse o konu yerine başka konuya geçilir. Görev tamamlanınca testler kitapta işaretlenir.
- **TYT/AYT dengesi düzeltildi:** denge artık sayısal ve sözel içinde ayrı kurulur (önceden SAY öğrencisinde sayısal blokların neredeyse hepsi AYT'ye kayıyordu).
- **Çalışma saatlerine otomatik yerleştirme:** saatsiz eklenen görev, o günün çalışma saatlerindeki ilk boş yere yerleşir; görev başka güne taşınınca yeni günde boş yere alınır; takvimde çalışma saati dışına ya da başka bloğun üstüne bırakılan blok en yakın uygun saate kayar. **"Saatlere yerleştir"** düğmesi haftanın bütün bloklarını sırası korunarak çalışma saatlerine dizer.

## Güncelleme 2.6 — kaynak kataloğu

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-10.sql` → **Run** (2.5'i henüz yüklemediyseniz önce `guncelleme-9.sql`). Yeni dosya: `katalog.tsx`.

- **Ayarlar → Kaynak kataloğu:** kitaplar sistemde tanımlanır (yayınevi, kitap adı, ders, tür, test sayısı). "Toplu ekle" ile Excel'den yapıştırılabilir (`Yayınevi | Kitap adı | Ders | Test sayısı`). İsteğe bağlı olarak hangi testin hangi konu olduğu (ör. Test 1–6 → Üslü İfadeler) tanımlanır. Katalog tüm danışmanlar için ortaktır; bir kitabı düzenlemek öğrencilerin listesini de günceller. "Kaldır" yeni seçimleri kapatır, mevcut listeleri bozmaz.
- **Öğrenci:** Konular → Kaynaklar → "Kaynak ekle" ile yalnızca katalogdan seçer; kitap bilgilerini değiştiremez, kaynak silemez. Testin numarasına dokunup doğru/yanlış girer; konu katalogdan kendiliğinden yazılır. Kaynağı "Devam / Ara verdim / Bitti" olarak işaretleyebilir.
- **Danışman:** öğrenci adına katalogdan ekler; katalogda olmayan kitabı aynı pencereden tanımlayıp ekleyebilir.
- Bu kurallar veritabanında da uygulanır (öğrenci katalog dışı kaynak oluşturamaz).

## Güncelleme 2.5 — ortak soru forumu

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-9.sql` → **Run**. Yeni dosya: `forum.tsx`.

- **Öğrenci → Sorular → Ortak sorular:** tüm öğrencilerin paylaştığı sorular. Herkes **tamamen anonim** ("Bir arkadaşın"). Cevap yazılabilir, çözüm fotoğrafı eklenebilir; soru sahibi "İşime yaradı" deyince soru "Çözüldü" olur. Uygunsuz içerik "Bildir" ile danışmana gider.
- **Paylaşmak:** Sorularım'da soruyu aç → "Arkadaşlarına sor (anonim)".
- **Onay:** öğrencinin paylaştığı soru ve yazdığı cevap, **kendi danışmanı onaylayınca** herkese açılır. Danışman → **Soru forumu → Onay bekleyen** (öğrencinin adı yalnızca burada, danışmana görünür). Danışman cevapları "Danışman" etiketiyle hemen yayınlanır; her danışman yayındaki bir içeriği gizleyebilir.
- Kötüye kullanıma karşı: günde en fazla 10 soru paylaşımı ve 30 cevap.

## Güncelleme 2.4 — hatırlatma merkezi, konu başarı analizi, kaynak takibi

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-8.sql` → **Run**. Yeni dosyalar: `hatirlatma.tsx`, `konu-analizi.tsx`, `kaynaklar.tsx`.

- **Hatırlatma (sol menü):** bugün görevi eksik / günlüğü yok / 3+ gündür kayıt yok / programsız öğrenciler. Şablondaki {ad}, {kalan}, {gorevler}, {haftalik}, {son_gunluk} her öğrencinin verisiyle dolar. WhatsApp'ta aç (telefon kayıtlıysa doğrudan o kişide), tek tıkla uygulama içi not veya seçilenlere toplu not. "Sıradaki" düğmesi gönderilmemiş bir sonraki öğrenciyi açar.
- **Öğrenci → Hesap → İletişim:** öğrenci ve veli telefonu (yalnızca danışman görür).
- **Konular → Başarı analizi:** derslere göre doğru oranı, öncelikli 10 konu (düşük doğru oranı + deneme yanlışları + son haftalardaki düşüş), son 8 haftanın konu × hafta tablosu.
- **Konular → Kaynaklar:** öğrencinin kitapları, test test ilerleme ve doğru oranı, kitapta zorlanılan konular. Program görevine kaynak + test numarası (ör. 12-14) bağlanabilir; görev tamamlanınca testler kendiliğinden işaretlenir.
- **Görev satırları:** öğrenci "Çözdüğüm"ün altında doğru / yanlış sayısını da girebilir (analizin temeli).

## Güncelleme 2.3 — çizgi grafik ve kişisel renk paleti

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-7.sql` → **Run**. Yeni dosya: `theme.tsx`.

- **Özet → Gelişim → Çubuk / Çizgi:** çözülen soru, çalışma süresi, program tamamlama ve uyku grafiklerini çizgiye çevirir. Seçim cihazda hatırlanır.
- **Ayarlar → Görünüm:** öğrenci (ve danışman) 7 renk paletinden birini (Petrol, Okyanus, Mor, Gül, Gün batımı, Orman, Grafit) ve Otomatik / Açık / Koyu temayı seçer. Seçim hesaba kaydedilir; telefonda ve bilgisayarda aynı görünür. Grafik renkleri okunabilirlik için sabittir.

## Güncelleme 2.2 — iki sürüm birleştirildi + gelişim panosu

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-6.sql` → **Run** (öğrenciyle paylaşılan notlar). `guncelleme-5.sql` daha önce çalıştırıldıysa tekrar gerekmez.

- **Özet → Gelişim:** Gün / Hafta / Ay seçimiyle çözülen soru (sayısal/sözel), çalışma süresi, program tamamlama, derslere göre soru, motivasyon-kaygı-enerji, uyku, TYT/AYT net grafikleri. Öğrenci aynısını **İlerleme** ekranında görür.
- **Program → Takvim görünümü:** blokları sürükleyip başka gün/saate taşıma, boş alana tıklayıp görev ekleme. Otomatik programda sade ayarlar, önizlemede **Değiştir** / **×**.
- **Denemeler → Konu bazlı yanlış geçmişi:** hangi konuda kaç denemede, hangi tarihte kaç yanlış.
- **Notlar → Öğrenciyle paylaşılan notlar:** öğrenci Bugün ekranında görür, "Okudum" der.
- Takvim, Sorular, Görüşmeler, Veli raporu, günlük değişken analizi aynen korundu.

## Güncelleme 2 — yeni haftalık program ve deneme analizi

Bu sürümü mevcut kuruluma yüklerken **bir kez** şunu yap: Supabase → SQL Editor → `guncelleme-2.sql` dosyasının tamamını yapıştır → **Run**. (Veri silmez.) Sonra tüm dosyaları GitHub'a yükle.

- **Program → Tablo:** Excel gibi; ders × gün. Hücreye tıkla → konu, görev türü (Soru / Konu / Tekrar / Deneme), hedef soru. Üst satırda her günün **müsaitliği** (Kapalı / Hafif / Normal / Yoğun).
- **Denemeler sekmesi:** kazanım karnesini (PDF) yükle; netler ve konu konu yanlış/boş sayıları otomatik okunur (gerekirse elle düzeltilir).
- **Otomatik program oluştur:** son denemedeki yanlış/boşlara ve müsait günlere göre her öncelikli konu için kısa konu tekrarı + soru çözümü dağıtır, günlük/haftalık hedef soruyu hesaplar. Sonra tabloda istediğin gibi düzenlersin. Soru hedefleri ve konu başına üst sınır `planner.ts` içinde.
- **Otomatik konu takibi:** görev tamamlanınca (ya da öğrenci hedef soru sayısına ulaşınca) konu takibi güncellenir: Konu → Bitti, Soru → Çalışılıyor, Tekrar → Tekrar edildi. Hiçbir zaman geri almaz.

## Güncelleme 8 — gelişim panosu (gün / hafta / ay)

SQL gerekmez. Yeni dosya: `progress.tsx`.

- **Danışman → öğrenci → Özet** ve **öğrenci → İlerleme** ekranında "Gelişim" bölümü. Üstteki **Gün / Hafta / Ay** seçimi: son 30 gün, son 12 hafta veya son 6 ay.
- Özet kutuları: bu dönem çözülen soru ve çalışma süresi (önceki döneme göre değişim), program tamamlama yüzdesi, doğru oranı.
- Grafikler: sayısal/sözel çözülen soru, çalışma süresi, program tamamlama (%80 çizgisi), derslere göre soru, motivasyon-kaygı-enerji, uyku, TYT ve AYT net gelişimi. Çubukların üzerine gelince ayrıntı görünür.
- Veriler programdaki görev sonuçlarından, günlük takipten ve denemelerden otomatik gelir.

## Güncelleme 7 — takvim görünümü ve kolay düzenleme

SQL gerekmez. Yeni dosya: `calendar.tsx`.

- **Program → Takvim:** günler sütun, saatler satır. Bloğu sürükleyip başka gün/saate bırak; boş alana tıklayınca o saate görev ekle; bloğa tıklayınca düzenle. (Telefonda sürükleme yok; düzenleyicide gün/saat değiştirilir.)
- **Görev düzenleyici:** "Başka konu öner" aynı dersten öncelikli konuları (deneme yanlışı, tekrar eden eksik, sıradaki konu) önerir. Öğrenci sonuçları katlanmış bölümde.
- **Otomatik program:** yalnızca tarih ve TYT/AYT denemesi görünür; dersler, oran, sıra, rutinler "Gelişmiş ayarlar"da. Önizlemede her blokta **Değiştir** (başka konu) ve **×** (kaldır).
- **Denemeler → Konu bazlı yanlış geçmişi:** her konu kaç denemede, hangi tarihlerde kaç yanlış/boş yapılmış. 2+ denemede tekrar eden eksikler otomatik programda öne alınır.

## Güncelleme 6 — öğrenciyle paylaşılan notlar

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-5.sql` → **Run**. Yeni dosya: `notes.tsx`.

- Öğrenci → **Notlar** sekmesi: üstte **"Öğrenciyle paylaşılan notlar"** (öğrenci Bugün ekranında görür, okuduğunda "Okundu" yazar), altta **"Özel görüşme notları"** (yalnızca sen görürsün).
- Destek panelinde öğrencinin notuna **"Öğrenciye gönder"** ile yanıt verilebilir.
- Öğrencinin destek ekranında 112 butonu yoktur; öğrenci danışmanına not bırakır.

## Güncelleme 5 — destek / risk yönlendirmesi

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-4.sql` → **Run**. Yeni dosya: `support.tsx`.

- **Otomatik uyarı:** Öğrenci günlük takibi kaydettikçe son 3 kayıt (son 7 gün) incelenir: 3 kayıtta da kaygı 4-5, ya da 3 kayıtta da motivasyon ve enerji 1-2, ya da en az 2 gün yüksek kaygı + 5 saatten az uyku → uyarı. Eşikler `guncelleme-4.sql` içindeki `check_support_risk` fonksiyonunda.
- **Öğrenci:** Bugün ekranında her zaman "Zor bir gün mü?" bağlantısı; otomatik uyarı oluşunca nazik bir destek kartı ("Konuşmak istiyorum" / "Şimdilik iyiyim"). Öğrenci uyarı nedenlerini ve danışman notlarını göremez.
- **Danışman:** Öğrenciler sayfasının üstünde "Destek gerekenler" listesi (önce öğrencinin kendi istekleri). Öğrenci → Özet → "Destek ve takip": Gördüm / Görüştüm / Veliyle paylaştım / Okul rehberliğine bildirdim / Uzmana yönlendirdim / Not / Kapattım — her adım tarihiyle kaydedilir.
- Bu bir kriz müdahale sistemi değildir; uyarılar danışman uygulamayı açtığında görülür.

## Danışman ekleme (ekip)

İlk kurulan danışman hesabı **yöneticidir**. Yönetici: **Ayarlar → Danışmanlar → Danışman ekle** → ad soyad, e-posta, geçici şifre → **Mesajı kopyala** ile yeni danışmana gönder. SQL gerekmez.

- Her danışman kendi e-postasıyla girer ve **yalnızca kendi eklediği öğrencileri** görür.
- Yönetici; danışmanın şifresini yenileyebilir, pasif yapabilir veya silebilir (silinen danışmanın öğrencileri ve notları yöneticiye geçer).
- Öğrenci aktarma: öğrenci → **Hesap** → **Başka danışmana aktar** (program, günlük ve danışman notları yeni danışmana geçer).

## Güncelleme 4 — çalışma saatleri ve saatli program

Bu sürümü yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-3.sql` dosyasının tamamını yapıştır → **Run** (veri silmez). Sonra tüm dosyaları GitHub'a yükle (yeni dosya: `schedule.tsx`).

- **Saatler sekmesi (danışman):** Her gün için çalışma saat aralıkları (ör. 17:00–19:30, 20:00–22:00), blok süresi (varsayılan 40 dk) ve mola (10 dk). Öğrenci bu saatleri Program sayfasında yalnızca görür.
- **Otomatik program:** Saatler bloklara bölünür; her blok bir konu. Bloklar **bir sayısal, bir sözel** sırasıyla dizilir (istersen 2 sayısal–1 sözel / 1 sayısal–2 sözel).
- **Alana göre dersler** (TYT dahil): SAY → Mat, Geo, Fizik, Kimya, Biyoloji (+ Türkçe); EA → Mat, Geo, Türkçe, Edebiyat, Tarih, Coğrafya; SÖZ → Türkçe, Edebiyat, Tarih, Coğrafya, Felsefe, Din (+ TYT Mat). Oluştururken ders kutucuklarından değiştirilebilir. Liste: `lib.ts` → `FIELD_SECTIONS`.
- **TYT ve AYT ayrı:** son TYT ve son AYT denemesi ayrı seçilir; bloklar TYT/AYT oranına göre dağılır (11. sınıf varsayılan TYT %70, 12/mezun %50).
- **Önceki programlar:** geçen haftadan tamamlanmayan konular öne alınır, geçen hafta konu çalışması yapılan konulara bu hafta soru verilir, uzun süredir görülmeyen bitmiş konular tekrar edilir, her dersin sıradaki başlanmamış konusu "yeni konu" olarak eklenir.
- Aynı haftaya yeniden oluşturursan tamamlanmamış görevler silinip yenisi yazılır, tamamlananlar kalır. Sayısal dersler tabloda mavi, sözel dersler turuncu çizgiyle gösterilir.

## Güncelleme 3 — karne kodla okunur

SQL çalıştırmaya gerek yok. Tüm dosyaları GitHub'a yükle (yeni dosya: `karne.ts`). Vercel'de daha önce `ANTHROPIC_API_KEY` eklediysen artık kullanılmıyor, silebilirsin.

## Otomatik karne analizi (kodla, yapay zekâsız)

Karne PDF'i sunucuda **kodla** okunur (`karne.ts`); hiçbir yapay zekâ servisi veya ek API anahtarı kullanılmaz, karne dışarıya gönderilmez.

Nasıl çalışır:

1. PDF'in metin katmanı konum bilgisiyle okunur (`unpdf`).
2. **D / Y / B** (Doğru / Yanlış / Boş) sütun başlıkları bulunur, alttaki satırlardaki sayılar sütunlara eşlenir. Başlık yoksa *soru = doğru + yanlış + boş* kuralını sağlayan sayı dizisi aranır. Soru soru listelenen karnelerde satırdaki durum (D/Y/B, ✓/✗ veya cevap anahtarı ≠ öğrenci cevabı) kullanılır.
3. Satırdaki kazanım metni, uygulamanın konu listesi + eş anlamlılar (`SYNONYMS`) ile eşleştirilir; ders başlığı (Türkçe, Temel Matematik…) bağlam olarak kullanılır.
4. Bölüm net satırları (Türkçe 40 30 8 2 …) netlere, yanlış/boş sayıları konulara yazılır ve program oluşturma penceresi açılır.

Kullanım: Öğrenci → **Denemeler** → **Kazanım karnesini yükle** → birkaç saniye → **Programı oluştur**. Yükleme sonrası "Okuma raporu"nda eşleşmeyen satırlar listelenir; sonuçlar ve program her zaman düzenlenebilir.

Sınırlar: Yalnızca yayınevinin verdiği **orijinal (metin içeren) PDF** okunur. Fotoğraf veya taranmış PDF kodla okunamaz → "Karnesiz elle giriş". Bir yayınevinin ifadesi eşleşmiyorsa `karne.ts` içindeki `SYNONYMS` listesine ifadeyi ekle (ör. `"tyt-matematik.problemler": [..., "yeni ifade"]`).

## Özelleştirme

GitHub'da dosyayı düzenleyip kaydettiğinde Vercel otomatik yeniden yayınlar.

- Program ders satırları, uyarı eşikleri (`THRESHOLDS`): `lib.ts`
- Konu listeleri: `curriculum.ts` (konu **adını** değiştirirsen o konudaki eski ilerleme eşleşmez)
- Renkler ve tema ("Sakin": krem zemin, petrol yeşili, Fraunces + IBM Plex Sans): `globals.css` (`:root` bölümü); yazı tipleri `layout.tsx`
- Alan adı: Vercel → **Settings → Domains**

## Güvenlik ve KVKK

- Veritabanı kuralları (RLS): öğrenci yalnızca kendi verisini, danışman yalnızca kendi öğrencilerini görür. Danışman notlarını öğrenci hiçbir koşulda göremez.
- `SUPABASE_SECRET_KEY` yalnızca sunucuda (Vercel) kullanılır; anahtarları hiçbir dosyaya yazıp GitHub'a yükleme.
- Öğrenci adı yerine kod kullanabilirsin. **Hesap → Öğrenciyi sil** tüm verileri kalıcı olarak siler.
- Supabase sunucuları Türkiye dışında (Frankfurt) olduğundan bu, KVKK'da yurt dışına aktarım sayılabilir; aydınlatma metni / veli onayında belirtmen önerilir (kesin değerlendirme için hukukçuya danış).

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Vercel: *Couldn't find any pages or app directory* | Depoda `hazirla.mjs` ve güncel `package.json` yok → tüm dosyaları tekrar yükle |
| Vercel: *[hazirla] EKSİK DOSYA: …* | Adı yazılan dosyayı depoya yükle |
| "Kurulum tamamlanmamış" ekranı | Vercel ortam değişkenleri eksik → ekle ve **Redeploy** |
| "Veritabanı tabloları bulunamadı" | `schema.sql` Supabase'de çalıştırılmamış |
| Öğrenci eklerken *Invalid API key* | `SUPABASE_SECRET_KEY` yerine legacy **service_role** anahtarını dene |
| Supabase projesi duraklatıldı | Ücretsiz plan 1 hafta kullanılmayınca durur → Supabase panelinden **Restore** |
