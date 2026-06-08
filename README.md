# Absensi Mahasiswa Online Cloud

Aplikasi Absensi Mahasiswa berbasis cloud yang berjalan di AWS EC2 menggunakan Docker, Kubernetes Minikube, dan PostgreSQL.

## Teknologi yang Digunakan

- AWS EC2 Ubuntu Server
- Docker
- Kubernetes
- Minikube
- PostgreSQL
- Node.js Express
- HTML, CSS, JavaScript
- GitHub

## Fitur Aplikasi

- Login admin dan user
- Tambah user oleh admin
- Check-in absensi
- Check-out absensi
- Riwayat absensi user
- Data absensi tersimpan di PostgreSQL
- Deployment menggunakan Kubernetes Service NodePort

## Default Login Admin

Email: admin@absensi.com

Password: admin123

## Cara Menjalankan di Kubernetes

1. Jalankan namespace:

kubectl apply -f k8s/namespace.yaml

2. Jalankan secret:

kubectl apply -f k8s/secret.yaml

3. Jalankan configmap:

kubectl apply -f k8s/configmap.yaml

4. Jalankan database PostgreSQL:

kubectl apply -f k8s/postgres.yaml

5. Jalankan aplikasi:

kubectl apply -f k8s/app.yaml

## Akses Aplikasi

http://PUBLIC_IP_EC2:30080

Contoh:

http://44.220.193.255:30080

## Cek Database

kubectl exec -it -n absensi deployment/postgres -- psql -U absensi_user -d absensi_db

Perintah SQL:

SELECT * FROM users;

SELECT * FROM attendances;

## Bukti Deployment

Aplikasi ini berhasil dijalankan menggunakan:

- Docker image absensi-online:1.0
- Kubernetes Deployment untuk aplikasi
- Kubernetes Deployment untuk PostgreSQL
- Kubernetes Service NodePort
- PersistentVolumeClaim untuk penyimpanan database
