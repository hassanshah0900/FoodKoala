// Package photos keeps chat photos in an S3 bucket (MinIO locally). The bucket is private:
// photos are only ever served through chat-service, to the people in the chat.
package photos

import (
	"context"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type S3 struct {
	Client *minio.Client
	Bucket string
}

func New(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*S3, error) {
	client, err := minio.New(endpoint, &minio.Options{Creds: credentials.NewStaticV4(accessKey, secretKey, ""), Secure: useSSL})
	if err != nil {
		return nil, err
	}
	return &S3{Client: client, Bucket: bucket}, nil
}

// EnsureBucket creates the bucket when it is missing; new buckets are private.
func (s *S3) EnsureBucket(ctx context.Context) error {
	exists, err := s.Client.BucketExists(ctx, s.Bucket)
	if err != nil || exists {
		return err
	}
	return s.Client.MakeBucket(ctx, s.Bucket, minio.MakeBucketOptions{})
}

func (s *S3) Ping(ctx context.Context) error {
	_, err := s.Client.BucketExists(ctx, s.Bucket)
	return err
}

func (s *S3) Put(ctx context.Context, key, contentType string, body io.Reader, size int64) error {
	_, err := s.Client.PutObject(ctx, s.Bucket, key, body, size, minio.PutObjectOptions{ContentType: contentType})
	return err
}

// Get opens a photo; the caller closes it.
func (s *S3) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	return s.Client.GetObject(ctx, s.Bucket, key, minio.GetObjectOptions{})
}
